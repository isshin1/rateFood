package com.ratefood.api_gateway.controller;

import com.ratefood.api_gateway.dto.JwtAuthenticationResponse;
import com.ratefood.api_gateway.dto.SignInRequest;
import com.ratefood.api_gateway.dto.SignUpRequest;
import com.ratefood.api_gateway.service.AuthenticationService;
import com.ratefood.api_gateway.service.impl.JwtServiceImpl;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.ValidationException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationService authenticationService;

    @Autowired
    private final JwtServiceImpl jwtService;

    @PostMapping("/signin")
    public Mono<ResponseEntity<JwtAuthenticationResponse>> signin(@RequestBody SignInRequest request) {
        return authenticationService.signin(request)
                .map(ResponseEntity::ok)
                .onErrorReturn(BadCredentialsException.class,
                        ResponseEntity.status(HttpStatus.UNAUTHORIZED).build())
                .onErrorReturn(UsernameNotFoundException.class,  // Add this
                        ResponseEntity.status(HttpStatus.UNAUTHORIZED).build())
                .onErrorReturn(DisabledException.class,
                        ResponseEntity.status(HttpStatus.FORBIDDEN).build())
                .onErrorReturn(LockedException.class,
                        ResponseEntity.status(HttpStatus.LOCKED).build())
                .onErrorReturn(AuthenticationException.class,  // Generic fallback
                        ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @PostMapping("/signup")
    public Mono<ResponseEntity<Object>> signup(@RequestBody SignUpRequest request) {
        return authenticationService.signup(request)
                .map(response -> ResponseEntity.ok((Object) response))
                .onErrorReturn(DataIntegrityViolationException.class,
                        ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("error", "An account with this email already exists")))
                .onErrorReturn(ConstraintViolationException.class,
                        ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(Map.of("error", "Invalid input data")))
                .onErrorReturn(IllegalArgumentException.class,
                        ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(Map.of("error", "Invalid request data")))
                .onErrorReturn(ValidationException.class,
                        ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                                .body(Map.of("error", "Validation failed")))
                .onErrorMap(Exception.class, ex -> {
                    log.error("Signup error: ", ex);
                    return new RuntimeException("Signup failed");
                })
                .onErrorReturn(RuntimeException.class,
                        ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body(Map.of("error", "Something went wrong. Please try again.")));
    }

    @PostMapping("/logout")
    public Mono<ResponseEntity<Map<String, String>>> logout(HttpServletRequest request) {
        try {
            // Extract token from Authorization header
            String authHeader = request.getHeader("Authorization");

            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);

                // Invalidate the token
                jwtService.invalidateToken(token);

                log.info("User logged out successfully, token invalidated");

                return Mono.just(ResponseEntity.ok(
                        Map.of("message", "Logout successful")
                ));
            } else {
                log.warn("Logout called without valid Authorization header");
                return Mono.just(ResponseEntity.ok(
                        Map.of("message", "Logout completed")
                ));
            }

        } catch (Exception ex) {
            log.error("Error during logout: ", ex);
            // Always return success for logout - don't block user from logging out
            return Mono.just(ResponseEntity.ok(
                    Map.of("message", "Logout completed")
            ));
        }
    }
}
