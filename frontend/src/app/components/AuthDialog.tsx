'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { useSession } from '@/app/contexts/SessionContext';
import { useState } from 'react';

const signInSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

const signUpSchema = z.object({
  username: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

// Interface for the authentication response matching your Spring Boot backend
interface AuthResponse {
  token: string;
  roles: string[];
}

export function AuthDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { login } = useSession();
  const [activeTab, setActiveTab] = useState('signin');

  const signInForm = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const signUpForm = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
    },
  });

  async function onSignInSubmit(values: z.infer<typeof signInSchema>) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        // Success case
        const data = await response.json();
        
        if (data.token && data.roles) {
          // Pass both token and roles to the login function
          login(data.token, data.roles);
          toast.success('Sign in successful!');
          onOpenChange(false);
          window.location.href = "/";
        } else {
          throw new Error('Token or roles not found in response');
        }
      } else {
        // Error case - handle different status codes
        let errorMessage = "Invalid email or password. Please try again.";
        
        try {
          const text = await response.text();
          if (text) {
            try {
              const errorData = JSON.parse(text);
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
              // If not JSON, use the text as error message
              errorMessage = text;
            }
          }
        } catch (e) {
          // If we can't read the response, use default message based on status
          console.error('Could not read error response:', e);
          if (response.status === 401) {
            errorMessage = "Invalid email or password";
          } else if (response.status === 403) {
            errorMessage = "Account is disabled";
          } else if (response.status === 423) {
            errorMessage = "Account is locked";
          }
        }

        // Show error toast
        toast.error(`Sign in failed: ${errorMessage}`);
      }
    } catch (error) {
      // Network errors or other unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      
      toast.error(`Sign in failed: ${errorMessage}`);
      console.error('Sign in failed:', error);
    }
  }

  async function onSignUpSubmit(values: z.infer<typeof signUpSchema>) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        // Success case
        toast.success('Sign up successful! Please sign in.');
        setActiveTab('signin');
        signUpForm.reset();
      } else {
        // Error case - handle different status codes
        let errorMessage = "Something went wrong. Please try again.";
        
        try {
          const text = await response.text();
          if (text) {
            try {
              const errorData = JSON.parse(text);
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
              // If not JSON, use the text as error message
              errorMessage = text;
            }
          }
        } catch (e) {
          // If we can't read the response, use default message based on status
          console.error('Could not read error response:', e);
          if (response.status === 409) {
            errorMessage = "An account with this email already exists";
          } else if (response.status === 400) {
            errorMessage = "Invalid input data";
          } else if (response.status === 422) {
            errorMessage = "Validation failed";
          }
        }

        // Show error toast
        toast.error(`Sign up failed: ${errorMessage}`);
      }
    } catch (error) {
      // Network errors or other unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      
      toast.error(`Sign up failed: ${errorMessage}`);
      console.error('Sign up failed:', error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
            </Tabs>
          </DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="signin">
            <Form {...signInForm}>
              <form onSubmit={signInForm.handleSubmit(onSignInSubmit)} className="space-y-6">
                <FormField
                  control={signInForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signInForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter your password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full">
                  Sign In
                </Button>
              </form>
            </Form>
          </TabsContent>
          <TabsContent value="signup">
            <Form {...signUpForm}>
              <form onSubmit={signUpForm.handleSubmit(onSignUpSubmit)} className="space-y-6">
                <FormField
                  control={signUpForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signUpForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signUpForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter your password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full">
                  Sign Up
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}