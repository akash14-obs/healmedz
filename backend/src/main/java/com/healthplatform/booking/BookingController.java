package com.healthplatform.booking;

import com.healthplatform.auth.AttemptLimiter;
import com.healthplatform.common.ApiException;
import com.healthplatform.common.Audit;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Patients book without an account and look a booking up with its number and their phone. */
@RestController
@RequestMapping("/api")
public class BookingController {

    public record BookableOffering(long offeringId, String serviceName, String providerName, BigDecimal price,
                                   boolean homeCollection, int reportTatHours) {}

    public record BookingRequest(@NotNull Long offeringId, @NotBlank @Size(max = 100) String patientName,
                                 @NotBlank String phone, @NotNull LocalDate visitDate, boolean consent) {}

    public record LookupRequest(@NotBlank String bookingNumber, @NotBlank String phone) {}

    public record BookingStatus(String bookingNumber, String serviceName, String providerName, String providerPhone,
                                LocalDate visitDate, int token, String status, BigDecimal price, long peopleAhead,
                                long estimatedWaitMinutes) {}

    public record QueueEntry(long id, String bookingNumber, int token, String patientName, String patientPhone,
                             String serviceName, String status) {}

    public record Queue(int minutesPerPatient, List<QueueEntry> bookings) {}

    public record StatusRequest(@NotBlank String status) {}

    public record QueueSettings(@NotNull @Min(1) @Max(240) Integer minutesPerPatient) {}

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final int MAX_DAYS_AHEAD = 30;
    private static final int MAX_BOOKINGS_PER_IP = 10;
    private static final int MAX_FAILED_LOOKUPS_PER_IP = 20;
    private static final String NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final Map<String, Set<String>> NEXT_STATUS = Map.of(
            "WAITING", Set.of("IN_PROGRESS", "CANCELLED"),
            "IN_PROGRESS", Set.of("COMPLETED", "CANCELLED"),
            "COMPLETED", Set.of(),
            "CANCELLED", Set.of());

    private final JdbcClient db;
    private final Audit audit;
    private final AttemptLimiter limiter;
    private final SecureRandom random = new SecureRandom();

    BookingController(JdbcClient db, Audit audit, AttemptLimiter limiter) {
        this.db = db;
        this.audit = audit;
        this.limiter = limiter;
    }

    @GetMapping("/public/offerings/{id}")
    public BookableOffering offering(@PathVariable long id) {
        return db.sql("""
                        SELECT po.offering_id, c.name AS service_name, pp.data->>'name' AS provider_name,
                               coalesce(po.discounted_price, po.regular_price) AS price,
                               po.home_collection, po.report_tat_hours
                        FROM published_offering po
                        JOIN published_profile pp ON pp.provider_id = po.provider_id
                        JOIN catalog_service c ON c.id = po.catalog_service_id
                        WHERE po.offering_id = ?""")
                .param(id).query(BookableOffering.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "This test is no longer listed."));
    }

    @PostMapping("/public/bookings")
    @Transactional
    public BookingStatus create(@Valid @RequestBody BookingRequest body, HttpServletRequest request) {
        String ipKey = "booking:" + request.getRemoteAddr();
        if (limiter.isBlocked(ipKey, MAX_BOOKINGS_PER_IP)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many bookings. Please wait 15 minutes and try again.");
        }
        if (!body.consent()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Please agree to share your details with the lab.");
        }
        String phone = normalizePhone(body.phone());
        LocalDate today = LocalDate.now(IST);
        if (body.visitDate().isBefore(today) || body.visitDate().isAfter(today.plusDays(MAX_DAYS_AHEAD))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a date within the next " + MAX_DAYS_AHEAD + " days.");
        }
        long providerId = db.sql("SELECT provider_id FROM published_offering WHERE offering_id = ?")
                .param(body.offeringId()).query(Long.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "This test is no longer listed."));
        limiter.record(ipKey);

        // Serialises token numbers for one lab and day, so two patients can never get the same token.
        db.sql("SELECT pg_advisory_xact_lock(?, ?)")
                .params((int) providerId, (int) body.visitDate().toEpochDay())
                .query((rs, n) -> 0).list();
        String number = newBookingNumber();
        db.sql("""
                INSERT INTO booking (booking_number, provider_id, offering_id, patient_name, patient_phone, visit_date,
                                     token, price_at_booking, consent_at)
                SELECT ?, po.provider_id, po.offering_id, ?, ?, ?,
                       (SELECT coalesce(max(b.token), 0) + 1 FROM booking b
                        WHERE b.provider_id = po.provider_id AND b.visit_date = ?),
                       coalesce(po.discounted_price, po.regular_price), now()
                FROM published_offering po WHERE po.offering_id = ?""")
                .params(number, body.patientName().trim(), phone, body.visitDate(), body.visitDate(), body.offeringId())
                .update();
        return find(number, phone).orElseThrow();
    }

    @PostMapping("/public/bookings/lookup")
    public BookingStatus lookup(@Valid @RequestBody LookupRequest body, HttpServletRequest request) {
        String ipKey = "booking-lookup:" + request.getRemoteAddr();
        if (limiter.isBlocked(ipKey, MAX_FAILED_LOOKUPS_PER_IP)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Please wait 15 minutes and try again.");
        }
        String number = body.bookingNumber().trim().toUpperCase();
        return find(number, normalizePhone(body.phone())).orElseThrow(() -> {
            limiter.record(ipKey);
            return new ApiException(HttpStatus.NOT_FOUND, "No booking matches that number and phone.");
        });
    }

    @GetMapping("/provider/bookings")
    public Queue queue(@AuthenticationPrincipal Jwt user,
                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        long providerId = providerId(user);
        int minutes = db.sql("SELECT minutes_per_patient FROM provider WHERE id = ?")
                .param(providerId).query(Integer.class).single();
        List<QueueEntry> bookings = db.sql("""
                        SELECT b.id, b.booking_number, b.token, b.patient_name, b.patient_phone,
                               c.name AS service_name, b.status
                        FROM booking b
                        JOIN offering o ON o.id = b.offering_id
                        JOIN catalog_service c ON c.id = o.catalog_service_id
                        WHERE b.provider_id = ? AND b.visit_date = ?
                        ORDER BY b.token""")
                .params(providerId, date == null ? LocalDate.now(IST) : date)
                .query(QueueEntry.class).list();
        return new Queue(minutes, bookings);
    }

    @PatchMapping("/provider/bookings/{id}/status")
    @Transactional
    public void setStatus(@AuthenticationPrincipal Jwt user, @PathVariable long id,
                          @Valid @RequestBody StatusRequest body) {
        String current = db.sql("SELECT status FROM booking WHERE id = ? AND provider_id = ? FOR UPDATE")
                .params(id, providerId(user)).query(String.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Booking not found."));
        if (!NEXT_STATUS.get(current).contains(body.status())) {
            throw new ApiException(HttpStatus.CONFLICT, "This booking can no longer be changed that way.");
        }
        db.sql("UPDATE booking SET status = ?, updated_at = now() WHERE id = ?").params(body.status(), id).update();
        audit.record(userId(user), "BOOKING_" + body.status(), "booking", id, null);
    }

    @PutMapping("/provider/queue-settings")
    public void saveSettings(@AuthenticationPrincipal Jwt user, @Valid @RequestBody QueueSettings body) {
        db.sql("UPDATE provider SET minutes_per_patient = ? WHERE id = ?")
                .params(body.minutesPerPatient(), providerId(user)).update();
    }

    private java.util.Optional<BookingStatus> find(String number, String phone) {
        return db.sql("""
                        SELECT b.booking_number, c.name AS service_name, pp.data->>'name' AS provider_name,
                               pp.data->>'phone' AS provider_phone, b.visit_date, b.token, b.status,
                               b.price_at_booking AS price,
                               CASE WHEN b.status = 'WAITING' THEN ahead.n ELSE 0 END AS people_ahead,
                               CASE WHEN b.status = 'WAITING' THEN ahead.n * p.minutes_per_patient ELSE 0 END
                                   AS estimated_wait_minutes
                        FROM booking b
                        JOIN provider p ON p.id = b.provider_id
                        JOIN offering o ON o.id = b.offering_id
                        JOIN catalog_service c ON c.id = o.catalog_service_id
                        LEFT JOIN published_profile pp ON pp.provider_id = b.provider_id
                        CROSS JOIN LATERAL (
                            SELECT count(*) AS n FROM booking a
                            WHERE a.provider_id = b.provider_id AND a.visit_date = b.visit_date
                              AND a.token < b.token AND a.status IN ('WAITING', 'IN_PROGRESS')) ahead
                        WHERE b.booking_number = ? AND b.patient_phone = ?""")
                .params(number, phone).query(BookingStatus.class).optional();
    }

    private String newBookingNumber() {
        StringBuilder number = new StringBuilder("HM-");
        for (int i = 0; i < 8; i++) {
            number.append(NUMBER_ALPHABET.charAt(random.nextInt(NUMBER_ALPHABET.length())));
        }
        return number.toString();
    }

    private static String normalizePhone(String raw) {
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() == 12 && digits.startsWith("91")) {
            digits = digits.substring(2);
        }
        if (!digits.matches("[6-9]\\d{9}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid 10-digit mobile number.");
        }
        return digits;
    }

    private static long userId(Jwt user) {
        return Long.parseLong(user.getSubject());
    }

    private long providerId(Jwt user) {
        return db.sql("SELECT id FROM provider WHERE owner_user_id = ?")
                .param(userId(user)).query(Long.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "No provider for this account."));
    }
}
