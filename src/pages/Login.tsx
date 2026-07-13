import { Button } from '@/components/ui/button';
import { signInWithGoogle } from '@/lib/householdAuth';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 px-4">
      <div className="text-3xl font-bold text-white">🐻 Bear House</div>
      <p className="text-slate-400 text-sm">Sign in to your household</p>
      <Button onClick={() => signInWithGoogle()} size="lg">
        Sign in with Google
      </Button>
    </div>
  );
}
