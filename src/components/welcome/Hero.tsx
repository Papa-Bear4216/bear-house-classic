import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function Hero() {
  return (
    <section className="flex flex-col items-center text-center gap-6 px-4 py-24 max-w-2xl mx-auto">
      <div className="text-5xl">🐻</div>
      <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight">
        Household chaos, <span className="text-amber-400">tamed</span>.
      </h1>
      <p className="text-lg text-slate-300 max-w-lg">
        FamilyOS remembers what your brain won't — chores, bills, promises, and
        who's
        supposed to walk the dog. Point a camera at a mess and let AI figure out
        what needs doing.
      </p>
      <div className="flex gap-3">
        <Link to="/login">
          <Button size="lg" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
            Get Started
          </Button>
        </Link>
        <Link to="/login">
          <Button size="lg" variant="outline">
            Log in
          </Button>
        </Link>
      </div>
    </section>
  );
}