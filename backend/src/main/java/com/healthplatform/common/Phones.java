package com.healthplatform.common;

import org.springframework.http.HttpStatus;

public final class Phones {

    private Phones() {}

    /** Returns the 10-digit Indian mobile number, accepting an optional +91 prefix. */
    public static String normalize(String raw) {
        String digits = raw == null ? "" : raw.replaceAll("\\D", "");
        if (digits.length() == 12 && digits.startsWith("91")) {
            digits = digits.substring(2);
        }
        if (!digits.matches("[6-9]\\d{9}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid 10-digit mobile number.");
        }
        return digits;
    }
}
