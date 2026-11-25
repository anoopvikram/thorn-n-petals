import React, { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

const navLinks = [
  { label: 'Menu', href: '/#menu' },
  { label: 'Our story', href: '/#story' },
  { label: 'Track order', href: '/track' },
];

export function Navbar({ count: bagItemCount, open: openBag }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const navigationLinks = navLinks.map(({ label, href }) => (
    <a key={href} href={href}>
      {label}
    </a>
  ));

  return (
    <header>
      <nav>
        <a className="brand" href="/">
          <span className="bloom" aria-hidden="true">✿</span> Thorn n’ Petals
        </a>

        <div className="navlinks">{navigationLinks}</div>

        <button className="bagBtn" onClick={openBag}>
          My bag <span id="count">{bagItemCount}</span>
        </button>

        <button
          id="navToggle"
          aria-label={isMobileNavOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={isMobileNavOpen}
          onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
        >
          ☰
        </button>
      </nav>

      <div
        id="mobileNav"
        hidden={!isMobileNavOpen}
        onClick={() => setIsMobileNavOpen(false)}
      >
        {navigationLinks}
      </div>
    </header>
  );
}

const featuredPicks = [
  { menuId: 0, image: '/assets/p0.webp' }, // Cappuccino
  { menuId: 1 }, // Berry pancakes uses its menu image.
  { menuId: 2, image: '/assets/p2.webp' }, // Blueberry cheesecake
];

const heroAnimationDurations = {
  copy: 0.65,
  priceCard: 0.65,
  pickImage: 0.65,
};

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

export function Hero({ menu }) {
  const [activePickIndex, setActivePickIndex] = useState(0);
  const heroRef = useRef(null);
  const pickCount = featuredPicks.length;
  const featuredPick = featuredPicks[activePickIndex];
  const menuItem = menu.find(({ id }) => id === featuredPick.menuId);

  useLayoutEffect(() => {
    if (matchMedia(reducedMotionQuery).matches) return;

    const animation = gsap.context(() => {
      gsap.from('.herocopy > *', {
        y: 22,
        opacity: 0,
        stagger: 0.09,
        duration: heroAnimationDurations.copy,
      });
      gsap.from('.pricecard', {
        opacity: 0,
        scale: 0.85,
        duration: heroAnimationDurations.priceCard,
      });
    }, heroRef);

    return () => animation.revert();
  }, []);

  useLayoutEffect(() => {
    if (!menuItem || matchMedia(reducedMotionQuery).matches) return;

    const animation = gsap.context(() => {
      gsap.from('#heroItem', {
        y: 22,
        rotation: -5,
        opacity: 0,
        duration: heroAnimationDurations.pickImage,
      });
    }, heroRef);

    return () => animation.revert();
  }, [activePickIndex, menuItem]);

  function showPreviousPick() {
    setActivePickIndex((index) => (index + pickCount - 1) % pickCount);
  }

  function showNextPick() {
    setActivePickIndex((index) => (index + 1) % pickCount);
  }

  return (
    <section className="hero" ref={heroRef} aria-label="Today's café picks">
      <div className="herocopy">
        <p className="eyebrow"><span className="dot" /> Café &amp; kitchen · Thrissur</p>
        <h1>A little coffee,<br /><i>a little calm.</i></h1>
        <p className="intro">
          From the first frothy sip to the last bite of cake. Find your favourite and order ahead for pickup.
        </p>
        <a className="btn" href="#menu">Explore the menu</a>
      </div>

      <div className="heroart">
        <div className="halo" />
        <span className="spark s1" aria-hidden="true">✳</span>
        <span className="spark s2" aria-hidden="true">✳</span>
        {menuItem && (
          <img id="heroItem" src={featuredPick.image ?? menuItem.image} alt={menuItem.name} />
        )}
        <div className="pricecard">
          <small>Counter pick</small>
          <strong id="heroName">{menuItem?.name}</strong>
          <span id="heroPrice">{menuItem && `₹${menuItem.price}`}</span>
        </div>
      </div>

      <div className="heroctrl">
        <button onClick={showPreviousPick} aria-label="Previous counter pick">‹</button>
        <span id="dots" aria-live="polite">{activePickIndex + 1} / {pickCount}</span>
        <button onClick={showNextPick} aria-label="Next counter pick">›</button>
      </div>
    </section>
  );
}

export function Story() {
  return (
    <section id="story" className="story area">
      <img src="/assets/cafe.webp" alt="Coffee cups and croissants on a rustic café table" loading="lazy" />
      <div>
        <p className="eyebrow">Our story · Since 2020</p>
        <h2>There’s a seat<br /><i>for you.</i></h2>
        <p>Thorn n’ Petals began in Thrissur with a simple idea: a café for slow breakfasts, long conversations, and a second cup. When the day moves faster, we’ll have your favourites ready for pickup.</p>
        <a href="#menu">Find your favourite</a>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="footgrid">
        <a className="footbrand" href="/"><span aria-hidden="true">✿</span> Thorn n’ Petals</a>
        <div>
          <strong>At the café</strong>
          <p>Thrissur, Kerala<br />Pickup 8 am – 8 pm IST</p>
        </div>
        <div>
          <strong>Order ahead</strong>
          <a href="/#menu">Browse menu</a>
          <a href="/track">Track your order</a>
          <a href="/kitchen">Staff kitchen</a>
        </div>
      </div>
      <div className="footbase">
        <span>Thorn n’ Petals Café</span>
        <a href="#main">Back to top</a>
      </div>
    </footer>
  );
}
