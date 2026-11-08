package com.healthplatform.config;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.File;
import java.io.IOException;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Runs a real PostgreSQL server for localhost, keeping its data between restarts. */
@Configuration
@Profile("local")
public class LocalPostgresConfig {

    @Bean(destroyMethod = "close")
    EmbeddedPostgres embeddedPostgres(
            @Value("${app.local-postgres.port}") int port,
            @Value("${app.local-postgres.data-directory}") String dataDirectory) throws IOException {
        File data = new File(dataDirectory).getAbsoluteFile();
        File work = new File(data.getParentFile(), "postgres-runtime");
        return EmbeddedPostgres.builder()
                .setPort(port)
                .setDataDirectory(data)
                .setCleanDataDirectory(false)
                .setOverrideWorkingDirectory(work)
                .start();
    }

    @Bean
    DataSource dataSource(EmbeddedPostgres postgres) {
        return postgres.getPostgresDatabase();
    }
}
