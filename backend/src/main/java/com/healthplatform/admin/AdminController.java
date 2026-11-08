package com.healthplatform.admin;

import com.fasterxml.jackson.annotation.JsonRawValue;
import com.healthplatform.common.ApiException;
import com.healthplatform.common.Audit;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    public enum Decision { APPROVE, REJECT }

    public record ReviewRequest(@NotNull Decision decision, @Size(max = 500) String note) {}

    public record PendingProfile(long versionId, long providerId, String ownerEmail, @JsonRawValue String data,
                                 @JsonRawValue String publishedData, OffsetDateTime submittedAt) {}

    public record PendingOffering(long versionId, String providerName, String ownerEmail, String serviceName,
                                  BigDecimal regularPrice, BigDecimal discountedPrice, boolean homeCollection,
                                  int reportTatHours, LocalDate effectiveFrom, String sourceNote,
                                  OffsetDateTime submittedAt, BigDecimal publishedPrice,
                                  BigDecimal publishedDiscount) {}

    public record Queue(List<PendingProfile> profiles, List<PendingOffering> offerings) {}

    private final JdbcClient db;
    private final Audit audit;

    AdminController(JdbcClient db, Audit audit) {
        this.db = db;
        this.audit = audit;
    }

    @GetMapping("/queue")
    public Queue queue() {
        List<PendingProfile> profiles = db.sql("""
                SELECT v.id AS version_id, v.provider_id, u.email AS owner_email, v.data::text AS data,
                       pp.data::text AS published_data, v.submitted_at
                FROM provider_profile_version v
                JOIN provider p ON p.id = v.provider_id
                JOIN app_user u ON u.id = p.owner_user_id
                LEFT JOIN published_profile pp ON pp.provider_id = v.provider_id
                WHERE v.status = 'PENDING'
                ORDER BY v.submitted_at""").query(PendingProfile.class).list();
        List<PendingOffering> offerings = db.sql("""
                SELECT v.id AS version_id,
                       coalesce(pp.data->>'name', '(profile not yet approved)') AS provider_name,
                       u.email AS owner_email, c.name AS service_name,
                       v.regular_price, v.discounted_price, v.home_collection, v.report_tat_hours,
                       v.effective_from, v.source_note, v.submitted_at,
                       po.regular_price AS published_price, po.discounted_price AS published_discount
                FROM offering_version v
                JOIN offering o ON o.id = v.offering_id
                JOIN provider p ON p.id = o.provider_id
                JOIN app_user u ON u.id = p.owner_user_id
                JOIN catalog_service c ON c.id = o.catalog_service_id
                LEFT JOIN published_profile pp ON pp.provider_id = o.provider_id
                LEFT JOIN published_offering po ON po.offering_id = o.id
                WHERE v.status = 'PENDING'
                ORDER BY v.submitted_at""").query(PendingOffering.class).list();
        return new Queue(profiles, offerings);
    }

    @PostMapping("/profiles/{versionId}/review")
    @Transactional
    public void reviewProfile(@AuthenticationPrincipal Jwt user, @PathVariable long versionId,
                              @Valid @RequestBody ReviewRequest body) {
        review(user, "provider_profile_version", versionId, body);
    }

    @PostMapping("/offerings/{versionId}/review")
    @Transactional
    public void reviewOffering(@AuthenticationPrincipal Jwt user, @PathVariable long versionId,
                               @Valid @RequestBody ReviewRequest body) {
        review(user, "offering_version", versionId, body);
    }

    /** {@code table} is only ever one of the two literals passed above. */
    private void review(Jwt user, String table, long versionId, ReviewRequest body) {
        String note = body.note() == null ? "" : body.note().trim();
        if (body.decision() == Decision.REJECT && note.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Give a reason so the provider can correct it.");
        }
        long actor = Long.parseLong(user.getSubject());
        String status = body.decision() == Decision.APPROVE ? "APPROVED" : "REJECTED";
        int changed = db.sql("UPDATE " + table + """
                         SET status = ?, reviewed_by = ?, reviewed_at = now(), review_note = ?
                        WHERE id = ? AND status = 'PENDING'""")
                .params(status, actor, note.isEmpty() ? null : note, versionId)
                .update();
        if (changed == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "This item was already reviewed or replaced.");
        }
        audit.record(actor, status, table, versionId, note.isEmpty() ? null : note);
    }
}
