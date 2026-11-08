package com.healthplatform.config;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Fills an empty local database with clearly fictional labs so every screen has something to show.
 * Runs only under the "local" profile. Names, addresses, phone numbers and prices are invented.
 */
@Component
@Profile("local")
class LocalDemoSeeder implements CommandLineRunner {

    private static final String PASSWORD = "localdemo-123";

    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private long adminId;

    LocalDemoSeeder(JdbcClient db, PasswordEncoder passwords) {
        this.db = db;
        this.passwords = passwords;
    }

    @Override
    public void run(String... args) {
        boolean seeded = db.sql("SELECT count(*) FROM app_user").query(Long.class).single() > 0;
        if (seeded) {
            return;
        }
        adminId = user("admin@local.test", "ADMIN");

        long a = lab("lab-a@local.test", "Demo Lab A", "Balaji Colony", "+91 00000 00001", true);
        price(a, "MRI Brain", 3500, null, false, 24);
        history(a, "MRI Brain", 3200, 400);
        price(a, "Complete Blood Count (CBC)", 300, 250, true, 12);
        price(a, "Thyroid Profile (T3, T4, TSH)", 550, 450, true, 24);
        price(a, "HbA1c", 480, null, true, 24);
        price(a, "Lipid Profile", 620, null, true, 24);
        price(a, "ECG", 250, null, false, 2);

        long b = lab("lab-b@local.test", "Demo Lab B", "Tiruchanur Road", "+91 00000 00002", true);
        price(b, "MRI Brain", 2800, null, false, 24);
        history(b, "MRI Brain", 2600, 500);
        history(b, "MRI Brain", 2400, 900);
        price(b, "Complete Blood Count (CBC)", 260, null, true, 8);
        price(b, "Thyroid Profile (T3, T4, TSH)", 600, 490, true, 12);
        price(b, "Liver Function Test (LFT)", 700, 640, true, 24);
        price(b, "Ultrasound Whole Abdomen", 1300, null, false, 4);
        pendingPrice(b, "Complete Blood Count (CBC)", 290);

        long c = lab("lab-c@local.test", "Demo Lab C", "Renigunta Road", "+91 00000 00003", true);
        price(c, "MRI Brain", 4000, 3700, false, 12);
        price(c, "MRI Knee", 4800, null, false, 12);
        price(c, "CT Brain (Plain)", 2200, null, false, 6);
        price(c, "HbA1c", 450, 399, false, 12);
        price(c, "Lipid Profile", 680, 560, false, 12);
        price(c, "X-Ray Chest PA View", 400, null, false, 2);

        // Waiting in the admin queue: not visible to patients until approved.
        lab("lab-d@local.test", "Demo Lab D", "Bairagipatteda", "+91 00000 00004", false);
    }

    private long user(String email, String role) {
        return db.sql("INSERT INTO app_user (email, password_hash, role) VALUES (?, ?, ?) RETURNING id")
                .params(email, passwords.encode(PASSWORD), role).query(Long.class).single();
    }

    private long lab(String email, String name, String locality, String phone, boolean approved) {
        long owner = user(email, "PROVIDER");
        long provider = db.sql("INSERT INTO provider (owner_user_id) VALUES (?) RETURNING id")
                .param(owner).query(Long.class).single();
        String data = """
                {"name":"%s","description":"Fictional lab used for local testing.","phone":"%s",
                 "email":"%s","website":"","licenseNumber":"DEMO-ONLY","facilities":"Parking, Wheelchair access",
                 "branches":[{"name":"Main branch","address":"Demo address, %s","locality":"%s","city":"Tirupati",
                              "pincode":"517501","phone":"%s","workingHours":"Mon-Sat, 7:00 AM - 8:00 PM"}]}
                """.formatted(name, phone, email, locality, locality, phone);
        if (approved) {
            db.sql("""
                    INSERT INTO provider_profile_version (provider_id, data, source_type, status, submitted_by,
                        submitted_at, reviewed_by, reviewed_at)
                    VALUES (?, CAST(? AS jsonb), 'DEMO_DATA', 'APPROVED', ?, now() - interval '30 days', ?,
                            now() - interval '28 days')""")
                    .params(provider, data, owner, adminId).update();
        } else {
            db.sql("""
                    INSERT INTO provider_profile_version (provider_id, data, source_type, submitted_by)
                    VALUES (?, CAST(? AS jsonb), 'DEMO_DATA', ?)""")
                    .params(provider, data, owner).update();
        }
        return provider;
    }

    private long offering(long provider, String service) {
        db.sql("""
                INSERT INTO offering (provider_id, catalog_service_id)
                SELECT ?, id FROM catalog_service WHERE name = ?
                ON CONFLICT DO NOTHING""").params(provider, service).update();
        return db.sql("""
                SELECT o.id FROM offering o JOIN catalog_service c ON c.id = o.catalog_service_id
                WHERE o.provider_id = ? AND c.name = ?""").params(provider, service).query(Long.class).single();
    }

    private void price(long provider, String service, int regular, Integer discounted, boolean home, int tat) {
        approvedVersion(offering(provider, service), regular, discounted, home, tat, 20);
    }

    private void history(long provider, String service, int regular, int daysAgo) {
        approvedVersion(offering(provider, service), regular, null, false, 24, daysAgo);
    }

    private void approvedVersion(long offering, int regular, Integer discounted, boolean home, int tat, int daysAgo) {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        db.sql("""
                INSERT INTO offering_version (offering_id, regular_price, discounted_price, home_collection,
                    report_tat_hours, effective_from, source_type, status, submitted_at, reviewed_by, reviewed_at)
                VALUES (?, ?, ?, ?, ?, ?, 'DEMO_DATA', 'APPROVED',
                        now() - make_interval(days => ?), ?, now() - make_interval(days => ?))""")
                .params(offering, BigDecimal.valueOf(regular), discounted == null ? null : BigDecimal.valueOf(discounted),
                        home, tat, today.minusDays(daysAgo), daysAgo + 2, adminId, daysAgo)
                .update();
    }

    private void pendingPrice(long provider, String service, int regular) {
        db.sql("""
                INSERT INTO offering_version (offering_id, regular_price, home_collection, report_tat_hours,
                    effective_from, source_type, source_note)
                VALUES (?, ?, TRUE, 8, ?, 'DEMO_DATA', 'Demo price change awaiting review')""")
                .params(offering(provider, service), BigDecimal.valueOf(regular),
                        LocalDate.now(ZoneId.of("Asia/Kolkata")))
                .update();
    }
}
