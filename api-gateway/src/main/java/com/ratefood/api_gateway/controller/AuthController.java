package com.ratefood.api_gateway.controller;

import com.ratefood.api_gateway.dto.JwtAuthenticationResponse;
import com.ratefood.api_gateway.dto.SignInRequest;
import com.ratefood.api_gateway.dto.SignUpRequest;
import com.ratefood.api_gateway.service.AuthenticationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthenticationService authenticationService;

    @PostMapping("/signup")
    public Mono<ResponseEntity<JwtAuthenticationResponse>> signup(@RequestBody SignUpRequest request) {
        return authenticationService.signup(request)
                .map(ResponseEntity::ok)
                .onErrorReturn(RuntimeException.class,
                        ResponseEntity.status(HttpStatus.CONFLICT).build());
    }

    @PostMapping("/signin")
    public Mono<ResponseEntity<JwtAuthenticationResponse>> signin(@RequestBody SignInRequest request) {
        return authenticationService.signin(request).map(response -> ResponseEntity.ok(response))
                .onErrorReturn(BadCredentialsException.class,
                        ResponseEntity.status(HttpStatus.UNAUTHORIZED).build())
                .onErrorReturn(Exception.class,
                        ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build());
    }

    @PostMapping("/logout")
    public Mono<ResponseEntity<String>> logout() {
        return Mono.just(ResponseEntity.ok("Logout successful"));
    }
}
