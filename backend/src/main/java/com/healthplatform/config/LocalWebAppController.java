package com.healthplatform.config;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Lets browser refreshes on Angular routes load the app when the backend serves it locally. */
@Controller
@Profile({"local", "render"})
class LocalWebAppController {

    @GetMapping({"/", "/search", "/diagnostics", "/hospitals", "/treatments", "/insurance", "/government-schemes",
            "/patient-rights", "/login", "/provider", "/admin", "/labs/{id}", "/book/{id}", "/booking"})
    String app() {
        return "forward:/index.html";
    }
}
