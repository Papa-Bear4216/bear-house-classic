import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import Welcome from './Welcome';
import { FeatureGrid } from '@/components/welcome/FeatureGrid';
import { FamilyRoles } from '@/components/welcome/FamilyRoles';
import { Hero } from '@/components/welcome/Hero';
import { AppMockupShowcase } from '@/components/welcome/AppMockupShowcase';

describe('Landing Page (Welcome & Welcome Components)', () => {
  it('renders FeatureGrid with all 15 core features including Monster Den, Pet Station, Bedtime soundscapes', () => {
    const html = renderToStaticMarkup(React.createElement(FeatureGrid));

    expect(html).toContain('AI Room Chore Scanner');
    expect(html).toContain('Kids World Monster Den &amp; Voice Translator');
    expect(html).toContain('“Who Fed the Dog?” Pet Feeding Station');
    expect(html).toContain('Kid Rooms &amp; Sealed Private Journal');
    expect(html).toContain('Routines, streaks &amp; 120Hz retro arcade');
    expect(html).toContain('Bedtime wind-down &amp; calming soundscapes');
    expect(html).toContain('Hermes BIFF tone check');
    expect(html).toContain('Custody &amp; calm swaps');
    expect(html).toContain('Medication &amp; dosing safety');
    expect(html).toContain('Backpack &amp; school stuff adder');
    expect(html).toContain('Receipts &amp; pantry vision');
    expect(html).toContain('Read-only bank sync');
    expect(html).toContain('Smart home &amp; allowlist controls');
    expect(html).toContain('COPPA verified child privacy');
  });

  it('renders FamilyRoles with the 4 household roles and pet station mention', () => {
    const html = renderToStaticMarkup(React.createElement(FamilyRoles));

    expect(html).toContain('Superadmin');
    expect(html).toContain('Admin');
    expect(html).toContain('Child');
    expect(html).toContain('Pet');
    expect(html).toContain('Kids World Monster Den');
    expect(html).toContain('Who Fed the Dog');
    expect(html).toContain('never count against your subscription seats');
  });

  it('renders Hero with HotMessExpress and Dysfunction Junction branding', () => {
    const html = renderToStaticMarkup(React.createElement(Hero));

    expect(html).toContain('HotMessExpress');
    expect(html).toContain('Dysfunction Junction');
    expect(html).toContain('Divorce is a mess');
    expect(html).toContain('Kids monster den &amp; voice translator');
    expect(html).toContain('“Who Fed the Dog?” pet logs');
    expect(html).toContain('Sign in with Google');
  });

  it('renders AppMockupShowcase with interactive tabs and Kids World & Den tab', () => {
    const html = renderToStaticMarkup(React.createElement(AppMockupShowcase));

    expect(html).toContain('Interactive Preview');
    expect(html).toContain('ADHD Focus Hero');
    expect(html).toContain('Kids World &amp; Den');
    expect(html).toContain('Room Scanner');
    expect(html).toContain('BIFF Tone Check');
    expect(html).toContain('Bento Dashboard');
    expect(html).toContain('Hermes Copilot');
  });

  it('renders full Welcome page with pricing breakdown, dispatch banner, and legal links', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(Welcome)
      )
    );

    expect(html).toContain('Junction Dispatch');
    expect(html).toContain('Dysfunction Junction');
    expect(html).toContain('How your household gets started');
    expect(html).toContain('Honest Family Pricing');
    expect(html).toContain('$9.99');
    expect(html).toContain('Kids World Monster Den &amp; Voice Translator');
    expect(html).toContain('Family Pet Station: real-time “Who Fed the Dog?” log');
    expect(html).toContain('120Hz Retro Canvas Arcade: Sock Python, Pantry Chomper &amp; Cosmic Clutter');
    expect(html).toContain('Bedtime wind-down: calming generative soundscape chimes');
    expect(html).toContain('Privacy Policy');
    expect(html).toContain('Terms of Service');
  });
});
