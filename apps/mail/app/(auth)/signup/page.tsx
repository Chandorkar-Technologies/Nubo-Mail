import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { signUp } from '@/lib/auth-client';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z
  .object({
    name: z.string().min(1, { message: 'Name is required' }),
    email: z.string().email({ message: 'Please enter a valid email address' }),
    password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export default function SignupPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setError(null);

    try {
      const result = await signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
        callbackURL: '/settings/connections',
      });

      if (result.error) {
        setError(result.error.message || 'Failed to create account');
        return;
      }

      setVerificationSent(true);
      toast.success('Account created! Please check your email to verify your account.');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  if (verificationSent) {
    return (
      <div className="flex h-full min-h-screen w-full items-center justify-center bg-[#111111]">
        <div className="animate-in slide-in-from-bottom-4 w-full max-w-md px-6 py-8 duration-500">
          <div className="text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <svg
                  className="h-8 w-8 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
            <h1 className="mb-2 text-3xl font-bold text-white">Check your email</h1>
            <p className="mb-6 text-gray-400">
              We've sent a verification link to <span className="text-white">{form.getValues('email')}</span>.
              Please click the link to verify your account.
            </p>
            <p className="text-sm text-gray-500">
              Didn't receive the email?{' '}
              <button
                onClick={() => onSubmit(form.getValues())}
                className="text-white underline hover:text-white/80"
                disabled={isLoading}
              >
                Resend verification email
              </button>
            </p>
            <div className="mt-8">
              <Link to="/login" className="text-sm text-gray-400 hover:text-white">
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen w-full items-center justify-center bg-[#111111]">
      <div className="animate-in slide-in-from-bottom-4 w-full max-w-md px-6 py-8 duration-500">
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-4xl font-bold text-white">Create an account</h1>
          <p className="text-gray-400">Sign up with your email to get started</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4 border-red-500/40 bg-red-500/10">
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-300">Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
                      {...field}
                      className="border-gray-700 bg-black text-white placeholder:text-gray-500"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-300">Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      {...field}
                      className="border-gray-700 bg-black text-white placeholder:text-gray-500"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-300">Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      {...field}
                      className="border-gray-700 bg-black text-white placeholder:text-gray-500"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-300">Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      {...field}
                      className="border-gray-700 bg-black text-white placeholder:text-gray-500"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Create account'}
            </Button>

            <p className="mt-4 text-center text-sm text-gray-400">
              After signing up, you'll need to connect an email account (Gmail, Outlook, or IMAP) to
              start using Nubo.
            </p>

            <div className="mt-4 text-center text-sm">
              <p className="text-gray-400">
                Already have an account?{' '}
                <Link to="/login" className="text-white underline hover:text-white/80">
                  Sign in
                </Link>
              </p>
            </div>
          </form>
        </Form>
      </div>

      <footer className="absolute bottom-0 w-full px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-6">
          <a
            href="/terms"
            className="text-[10px] text-gray-500 transition-colors hover:text-gray-300"
          >
            Terms of Service
          </a>
          <a
            href="/privacy"
            className="text-[10px] text-gray-500 transition-colors hover:text-gray-300"
          >
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
}
