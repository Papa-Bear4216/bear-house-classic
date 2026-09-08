import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Hero } from '@/components/welcome/Hero';
import { FeatureGrid } from '@/components/welcome/FeatureGrid';
import { FamilyRoles } from '@/components/welcome/FamilyRoles';

export default function Welcome() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Hero />
      <FeatureGrid />
      <FamilyRoles />
      <section className="text-center px-4 py-20">
        <Link to="/login">
          <Button size="lg" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
            Get Started
          </Button>
        </Link>
      </section>
    </div>
  );
}