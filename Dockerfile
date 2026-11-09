# Builds the Angular app and Spring Boot API into one small image for Render.
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/src ./src
COPY web/public ./public
COPY web/angular.json web/tsconfig.json web/tsconfig.app.json ./
RUN NG_CLI_ANALYTICS=false npx ng build

FROM maven:3.9-eclipse-temurin-17 AS api
WORKDIR /backend
COPY backend/pom.xml ./
COPY backend/src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:17-jre
RUN useradd --system --no-create-home healmedz
WORKDIR /app
COPY --from=api /backend/target/backend-0.1.0.jar app.jar
COPY --from=web /web/dist/web/browser web
USER healmedz
# Tuned for Render's free plan: 512 MB of memory and a small share of one CPU.
CMD ["java", "-XX:MaxRAMPercentage=60", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-Xss512k", "-jar", "app.jar"]
