package com.healthplatform.provider;

import com.fasterxml.jackson.annotation.JsonRawValue;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.healthplatform.common.ApiException;
import com.healthplatform.common.Audit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
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
import org.springframework.web.bind.annotation.RestController;

/** A lab's own workspace. The provider id always comes from the signed-in user. */
@RestController
@RequestMapping("/api/provider")
public class ProviderController {

    public record Submission(@JsonRawValue String data, String status, OffsetDateTime submittedAt,
                             OffsetDateTime reviewedAt, String reviewNote) {}

    public record Dashboard(long providerId, boolean published, Submission latest) {}

    public record OfferingRequest(
            @NotNull Long catalogServiceId,
            @NotNull @DecimalMin(value = "1") @DecimalMax(value = "9999999") BigDecimal regularPrice,
            @DecimalMin(value = "1") @DecimalMax(value = "9999999") BigDecimal discountedPrice,
            @NotNull Boolean homeCollection,
            @NotNull @Min(1) @Max(2160) Integer reportTatHours,
            @NotNull LocalDate effectiveFrom,
            @Size(max = 300) String sourceNote) {}

    public record ActiveRequest(@NotNull Boolean active) {}

    public record OfferingRow(long offeringId, long serviceId, String serviceName, String category, boolean active,
                              BigDecimal publishedPrice, BigDecimal publishedDiscount, OffsetDateTime verifiedAt,
                              BigDecimal latestPrice, BigDecimal latestDiscount, Boolean latestHomeCollection,
                              Integer latestTatHours, LocalDate latestEffectiveFrom, String latestStatus,
                              String latestNote) {}

    private final JdbcClient db;
    private final ObjectMapper json;
    private final Audit audit;

    ProviderController(JdbcClient db, ObjectMapper json, Audit audit) {
        this.db = db;
        this.json = json;
        this.audit = audit;
    }

    @GetMapping("/dashboard")
    public Dashboard dashboard(@AuthenticationPrincipal Jwt user) {
        long providerId = providerId(user);
        boolean published = db.sql("SELECT count(*) FROM published_profile WHERE provider_id = ?")
                .param(providerId).query(Long.class).single() > 0;
        Submission latest = db.sql("""
                        SELECT data::text AS data, status, submitted_at, reviewed_at, review_note
                        FROM provider_profile_version
                        WHERE provider_id = ? AND status <> 'SUPERSEDED'
                        ORDER BY id DESC LIMIT 1""")
                .param(providerId).query(Submission.class).optional().orElse(null);
        return new Dashboard(providerId, published, latest);
    }

    @PutMapping("/profile")
    @Transactional
    public void submitProfile(@AuthenticationPrincipal Jwt user, @Valid @RequestBody ProfileData body)
            throws JsonProcessingException {
        long providerId = providerId(user);
        db.sql("""
                UPDATE provider_profile_version SET status = 'SUPERSEDED'
                WHERE provider_id = ? AND status = 'PENDING'""").param(providerId).update();
        long id = db.sql("""
                        INSERT INTO provider_profile_version (provider_id, data, source_type, submitted_by)
                        VALUES (?, CAST(? AS jsonb), 'PROVIDER_DECLARED', ?) RETURNING id""")
                .params(providerId, json.writeValueAsString(body), userId(user))
                .query(Long.class).single();
        audit.record(userId(user), "PROFILE_SUBMITTED", "provider_profile_version", id, null);
    }

    @GetMapping("/offerings")
    public List<OfferingRow> offerings(@AuthenticationPrincipal Jwt user) {
        return db.sql("""
                        SELECT o.id AS offering_id, c.id AS service_id, c.name AS service_name, c.category, o.active,
                               po.regular_price AS published_price, po.discounted_price AS published_discount,
                               po.reviewed_at AS verified_at,
                               l.regular_price AS latest_price, l.discounted_price AS latest_discount,
                               l.home_collection AS latest_home_collection, l.report_tat_hours AS latest_tat_hours,
                               l.effective_from AS latest_effective_from, l.status AS latest_status,
                               l.review_note AS latest_note
                        FROM offering o
                        JOIN catalog_service c ON c.id = o.catalog_service_id
                        LEFT JOIN published_offering po ON po.offering_id = o.id
                        LEFT JOIN LATERAL (
                            SELECT * FROM offering_version v
                            WHERE v.offering_id = o.id AND v.status <> 'SUPERSEDED'
                            ORDER BY v.id DESC LIMIT 1) l ON TRUE
                        WHERE o.provider_id = ?
                        ORDER BY c.category, c.name""")
                .param(providerId(user)).query(OfferingRow.class).list();
    }

    /** Adds the service if new, then files a new pending version. Published data stays until approval. */
    @PostMapping("/offerings")
    @Transactional
    public void submitOffering(@AuthenticationPrincipal Jwt user, @Valid @RequestBody OfferingRequest body) {
        if (body.discountedPrice() != null && body.discountedPrice().compareTo(body.regularPrice()) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Discounted price cannot be more than the regular price.");
        }
        boolean serviceExists = db.sql("SELECT count(*) FROM catalog_service WHERE id = ?")
                .param(body.catalogServiceId()).query(Long.class).single() > 0;
        if (!serviceExists) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown service.");
        }
        long providerId = providerId(user);
        db.sql("""
                INSERT INTO offering (provider_id, catalog_service_id) VALUES (?, ?)
                ON CONFLICT (provider_id, catalog_service_id) DO UPDATE SET active = TRUE""")
                .params(providerId, body.catalogServiceId()).update();
        long offeringId = db.sql("SELECT id FROM offering WHERE provider_id = ? AND catalog_service_id = ?")
                .params(providerId, body.catalogServiceId()).query(Long.class).single();
        db.sql("UPDATE offering_version SET status = 'SUPERSEDED' WHERE offering_id = ? AND status = 'PENDING'")
                .param(offeringId).update();
        long versionId = db.sql("""
                        INSERT INTO offering_version (offering_id, regular_price, discounted_price, home_collection,
                            report_tat_hours, effective_from, source_type, source_note, submitted_by)
                        VALUES (?, ?, ?, ?, ?, ?, 'PROVIDER_DECLARED', ?, ?) RETURNING id""")
                .params(offeringId, body.regularPrice(), body.discountedPrice(), body.homeCollection(),
                        body.reportTatHours(), body.effectiveFrom(), body.sourceNote(), userId(user))
                .query(Long.class).single();
        audit.record(userId(user), "OFFERING_SUBMITTED", "offering_version", versionId, null);
    }

    /** Withdrawing a service applies at once: a lab must always be able to stop listing it. */
    @PatchMapping("/offerings/{id}/active")
    @Transactional
    public void setActive(@AuthenticationPrincipal Jwt user, @PathVariable long id,
                          @Valid @RequestBody ActiveRequest body) {
        int changed = db.sql("UPDATE offering SET active = ? WHERE id = ? AND provider_id = ?")
                .params(body.active(), id, providerId(user)).update();
        if (changed == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Service not found.");
        }
        audit.record(userId(user), body.active() ? "OFFERING_RESUMED" : "OFFERING_WITHDRAWN", "offering", id, null);
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
