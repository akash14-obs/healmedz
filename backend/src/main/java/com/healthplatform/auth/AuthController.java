package com.healthplatform.auth;

import com.healthplatform.common.ApiException;
import com.healthplatform.common.Audit;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record Credentials(
            @NotBlank @Email String email,
            @NotBlank @Size(min = 10, max = 72, message = "must be 10 to 72 characters") String password) {}

    public record Session(String token, String role, String email) {}

    record UserRow(long id, String email, String passwordHash, String role) {}

    private static final int MAX_FAILED_LOGINS_PER_ACCOUNT = 5;
    private static final int MAX_FAILED_LOGINS_PER_IP = 30;
    private static final int MAX_REGISTRATIONS_PER_IP = 10;

    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final JwtEncoder jwt;
    private final Audit audit;
    private final Duration ttl;
    private final AttemptLimiter limiter;

    AuthController(JdbcClient db, PasswordEncoder passwords, JwtEncoder jwt, Audit audit, AttemptLimiter limiter,
                   @Value("${app.jwt-ttl-hours}") long ttlHours) {
        this.db = db;
        this.passwords = passwords;
        this.jwt = jwt;
        this.audit = audit;
        this.limiter = limiter;
        this.ttl = Duration.ofHours(ttlHours);
    }

    @PostMapping("/register-provider")
    @Transactional
    public Session register(@Valid @RequestBody Credentials body, HttpServletRequest request) {
        String ipKey = "register:" + request.getRemoteAddr();
        if (limiter.isBlocked(ipKey, MAX_REGISTRATIONS_PER_IP)) {
            throw tooMany();
        }
        limiter.record(ipKey);
        long userId;
        try {
            userId = db.sql("INSERT INTO app_user (email, password_hash, role) VALUES (?, ?, 'PROVIDER') RETURNING id")
                    .params(body.email().trim(), passwords.encode(body.password()))
                    .query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists.");
        }
        long providerId = db.sql("INSERT INTO provider (owner_user_id) VALUES (?) RETURNING id")
                .param(userId).query(Long.class).single();
        audit.record(userId, "PROVIDER_REGISTERED", "provider", providerId, null);
        return session(userId, body.email().trim(), "PROVIDER");
    }

    @PostMapping("/login")
    public Session login(@RequestBody Credentials body, HttpServletRequest request) {
        String email = body.email() == null ? "" : body.email().trim();
        String ipKey = "login:" + request.getRemoteAddr();
        // Keyed on IP as well as email, so nobody can lock a real user out from another address.
        String accountKey = ipKey + ":" + email.toLowerCase(Locale.ROOT);
        if (limiter.isBlocked(ipKey, MAX_FAILED_LOGINS_PER_IP) || limiter.isBlocked(accountKey, MAX_FAILED_LOGINS_PER_ACCOUNT)) {
            throw tooMany();
        }
        Optional<UserRow> user = db.sql(
                        "SELECT id, email, password_hash, role FROM app_user WHERE lower(email) = lower(?)")
                .param(email)
                .query(UserRow.class).optional();
        if (user.isEmpty() || body.password() == null
                || !passwords.matches(body.password(), user.get().passwordHash())) {
            limiter.record(ipKey);
            limiter.record(accountKey);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Incorrect email or password.");
        }
        return session(user.get().id(), user.get().email(), user.get().role());
    }

    private static ApiException tooMany() {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Please wait 15 minutes and try again.");
    }

    private Session session(long userId, String email, String role) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(Long.toString(userId))
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .claim("role", role)
                .build();
        String token = jwt.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new Session(token, role, email);
    }
}
