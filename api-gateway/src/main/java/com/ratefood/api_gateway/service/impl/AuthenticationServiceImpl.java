package com.ratefood.api_gateway.service.impl;

import com.ratefood.api_gateway.dto.JwtAuthenticationResponse;
import com.ratefood.api_gateway.dto.SignInRequest;
import com.ratefood.api_gateway.dto.SignUpRequest;
import com.ratefood.api_gateway.entity.Role;
import com.ratefood.api_gateway.entity.User;
import com.ratefood.api_gateway.repository.UserRepository;
import com.ratefood.api_gateway.service.AuthenticationService;
import com.ratefood.api_gateway.service.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.ReactiveAuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@Service
@RequiredArgsConstructor
public class AuthenticationServiceImpl implements AuthenticationService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final ReactiveAuthenticationManager authenticationManager;

    @Override
    public Mono<JwtAuthenticationResponse> signup(SignUpRequest request) {
        return Mono.fromCallable(() -> {
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new RuntimeException("Email already exists");
            }
            var user = User.builder()
                    .firstName(request.getFirstName())
                    .lastName(request.getLastName())
                    .email(request.getEmail())
                    .password(passwordEncoder.encode(request.getPassword()))
                    .role(Role.USER)
                    .build();
            userRepository.save(user);
            var jwt = jwtService.generateToken(user);
            var roles = user.getAuthorities().stream()
                    .map(auth -> auth.getAuthority())
                    .toList();
            return JwtAuthenticationResponse.builder()
                    .token(jwt)
                    .roles(roles)
                    .build();
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<JwtAuthenticationResponse> signin(SignInRequest request) {
        return authenticationManager
                .authenticate(new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()))
                .map(authentication -> {
                    var user = (User) authentication.getPrincipal();
                    var jwt = jwtService.generateToken(user);
                    var roles = user.getAuthorities().stream()
                            .map(auth -> auth.getAuthority())
                            .toList();
                    return JwtAuthenticationResponse.builder()
                            .token(jwt)
                            .roles(roles)
                            .build();
                })
                .onErrorMap(BadCredentialsException.class, ex ->
                        new RuntimeException("Invalid email or password"))
                .onErrorMap(DisabledException.class, ex ->
                        new RuntimeException("Account is disabled"))
                .onErrorMap(LockedException.class, ex ->
                        new RuntimeException("Account is locked"));
    }
}