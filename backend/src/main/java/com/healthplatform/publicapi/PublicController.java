package com.healthplatform.publicapi;

import com.fasterxml.jackson.annotation.JsonRawValue;
import com.healthplatform.common.ApiException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Patient-facing read API. Only ever reads approved, published data. */
@RestController
@RequestMapping("/api/public")
public class PublicController {

    private static final Set<String> NOISE = Set.of("test", "tests", "scan", "scans", "near", "in", "for", "the", "a");

    public record CatalogItem(long id, String name, String category) {}

    public record OfferingView(long offeringId, long providerId, String providerName, String phone, String localities,
                               long serviceId, String serviceName, String category,
                               BigDecimal regularPrice, BigDecimal discountedPrice, boolean homeCollection,
                               int reportTatHours, LocalDate effectiveFrom, String sourceType, String sourceNote,
                               OffsetDateTime submittedAt, OffsetDateTime verifiedAt) {}

    public record HistoryEntry(BigDecimal regularPrice, BigDecimal discountedPrice, boolean homeCollection,
                               int reportTatHours, LocalDate effectiveFrom, String sourceType,
                               OffsetDateTime submittedAt, OffsetDateTime verifiedAt) {}

    public record ProviderProfile(long id, @JsonRawValue String data, String sourceType,
                                  OffsetDateTime submittedAt, OffsetDateTime verifiedAt) {}

    public record ProviderDetail(ProviderProfile profile, List<OfferingView> offerings) {}

    public record Meta(boolean demoData) {}

    public record LocationOption(String label, String type) {}

    private static final String OFFERING_SELECT = """
            SELECT po.offering_id, po.provider_id,
                   pp.data->>'name' AS provider_name, pp.data->>'phone' AS phone,
                   (SELECT string_agg(DISTINCT coalesce(nullif(b->>'locality', ''), b->>'city'), ', ')
                      FROM jsonb_array_elements(pp.data->'branches') b) AS localities,
                   c.id AS service_id, c.name AS service_name, c.category,
                   po.regular_price, po.discounted_price, po.home_collection, po.report_tat_hours,
                   po.effective_from, po.source_type, po.source_note,
                   po.submitted_at, po.reviewed_at AS verified_at
            FROM published_offering po
            JOIN published_profile pp ON pp.provider_id = po.provider_id
            JOIN catalog_service c ON c.id = po.catalog_service_id
            """;

    private final JdbcClient db;
    private final boolean demoData;

    PublicController(JdbcClient db, @Value("${app.demo-data}") boolean demoData) {
        this.db = db;
        this.demoData = demoData;
    }

    @GetMapping("/meta")
    public Meta meta() {
        return new Meta(demoData);
    }

    @GetMapping("/catalog")
    public List<CatalogItem> catalog(@RequestParam(defaultValue = "") String q) {
        List<String> tokens = tokens(q);
        StringBuilder sql = new StringBuilder("SELECT id, name, category FROM catalog_service WHERE TRUE");
        List<Object> params = new ArrayList<>();
        addTokenFilter(sql, params, tokens, "name || ' ' || aliases");
        sql.append(" ORDER BY name LIMIT 100");
        return db.sql(sql.toString()).params(params).query(CatalogItem.class).list();
    }

    /** Cities, areas and pincodes that have at least one published branch. */
    @GetMapping("/locations")
    public List<LocationOption> locations() {
        return db.sql("""
                        SELECT DISTINCT label, type FROM (
                            SELECT nullif(trim(b->>'city'), '') AS label, 'CITY' AS type
                              FROM published_profile pp, jsonb_array_elements(pp.data->'branches') b
                            UNION ALL
                            SELECT nullif(trim(b->>'locality'), ''), 'AREA'
                              FROM published_profile pp, jsonb_array_elements(pp.data->'branches') b
                            UNION ALL
                            SELECT nullif(trim(b->>'pincode'), ''), 'PINCODE'
                              FROM published_profile pp, jsonb_array_elements(pp.data->'branches') b
                        ) l
                        WHERE label IS NOT NULL
                        ORDER BY type, label
                        LIMIT 200""")
                .query(LocationOption.class).list();
    }

    @GetMapping("/search")
    public List<OfferingView> search(@RequestParam String q,
                                     @RequestParam(defaultValue = "Tirupati") String location,
                                     @RequestParam(required = false) Boolean homeCollection,
                                     @RequestParam(required = false) BigDecimal maxPrice,
                                     @RequestParam(defaultValue = "price") String sort) {
        List<String> tokens = tokens(q);
        if (tokens.isEmpty()) {
            return List.of();
        }
        String place = location.isBlank() ? "Tirupati" : location.trim();
        StringBuilder sql = new StringBuilder(OFFERING_SELECT).append("""
                WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(pp.data->'branches') b
                              WHERE b->>'city' ILIKE ? ESCAPE '\\'
                                 OR b->>'locality' ILIKE ? ESCAPE '\\'
                                 OR b->>'pincode' = ?)
                """);
        List<Object> params = new ArrayList<>(List.of(escapeLike(place), "%" + escapeLike(place) + "%", place));
        addTokenFilter(sql, params, tokens, "c.name || ' ' || c.aliases");
        if (Boolean.TRUE.equals(homeCollection)) {
            sql.append(" AND po.home_collection");
        }
        if (maxPrice != null) {
            sql.append(" AND coalesce(po.discounted_price, po.regular_price) <= ?");
            params.add(maxPrice);
        }
        sql.append(" ORDER BY c.name, ").append("tat".equals(sort)
                ? "po.report_tat_hours, coalesce(po.discounted_price, po.regular_price)"
                : "coalesce(po.discounted_price, po.regular_price), po.report_tat_hours");
        sql.append(" LIMIT 200");
        return db.sql(sql.toString()).params(params).query(OfferingView.class).list();
    }

    @GetMapping("/providers/{id}")
    public ProviderDetail provider(@PathVariable long id) {
        ProviderProfile profile = db.sql("""
                        SELECT provider_id AS id, data::text AS data, source_type, submitted_at, reviewed_at AS verified_at
                        FROM published_profile WHERE provider_id = ?""")
                .param(id).query(ProviderProfile.class).optional()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Provider not found."));
        List<OfferingView> offerings = db.sql(OFFERING_SELECT + " WHERE po.provider_id = ? ORDER BY c.category, c.name")
                .param(id).query(OfferingView.class).list();
        return new ProviderDetail(profile, offerings);
    }

    /** Every approved version of an offering, newest first, including ones later replaced. */
    @GetMapping("/offerings/{id}/history")
    public List<HistoryEntry> history(@PathVariable long id) {
        return db.sql("""
                        SELECT v.regular_price, v.discounted_price, v.home_collection, v.report_tat_hours,
                               v.effective_from, v.source_type, v.submitted_at, v.reviewed_at AS verified_at
                        FROM offering_version v
                        JOIN offering o ON o.id = v.offering_id AND o.active
                        JOIN published_profile p ON p.provider_id = o.provider_id
                        WHERE v.offering_id = ? AND v.status = 'APPROVED'
                          AND v.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
                        ORDER BY v.effective_from DESC, v.reviewed_at DESC, v.id DESC""")
                .param(id).query(HistoryEntry.class).list();
    }

    private static List<String> tokens(String q) {
        return Arrays.stream(q.toLowerCase().trim().split("[^\\p{L}\\p{N}]+"))
                .filter(t -> !t.isBlank() && !NOISE.contains(t))
                .toList();
    }

    /** Matches the start of a word, so "ct" finds "CT Brain" but not "Function". Tokens are letters and digits only. */
    private static void addTokenFilter(StringBuilder sql, List<Object> params, List<String> tokens, String column) {
        for (String token : tokens) {
            sql.append(" AND (").append(column).append(") ~* ?");
            params.add("\\y" + token);
        }
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
