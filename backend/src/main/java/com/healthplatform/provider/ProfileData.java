package com.healthplatform.provider;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** The provider profile, stored as one reviewable snapshot per submission. */
public record ProfileData(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 1000) String description,
        @NotBlank @Pattern(regexp = "^[+0-9 ()-]{7,20}$", message = "must be a valid phone number") String phone,
        @Email String email,
        @Size(max = 200) String website,
        @Size(max = 100) String licenseNumber,
        @Size(max = 500) String facilities,
        @NotEmpty(message = "add at least one branch") @Valid List<Branch> branches) {

    public record Branch(
            @NotBlank @Size(max = 150) String name,
            @NotBlank @Size(max = 300) String address,
            @Size(max = 100) String locality,
            @NotBlank @Size(max = 100) String city,
            @Pattern(regexp = "^$|^[0-9]{6}$", message = "must be 6 digits") String pincode,
            @Size(max = 20) String phone,
            @Size(max = 150) String workingHours) {}
}
