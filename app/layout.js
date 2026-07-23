import './globals.css'

export const metadata = {
  title: 'Camp Sasquatch — Book Your Patch of Dirt',
  description: 'Squatch-approved camping in beautiful British Columbia since 1974.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <div className="masthead-inner">
            <a className="brand" href="#">
              <span className="brand-mark" aria-hidden="true">
                🦶
              </span>
              <span className="brand-text">
                <strong>Camp Sasquatch</strong>
                <span>Big feet. Bigger memories.</span>
              </span>
            </a>
            <nav className="masthead-nav" aria-label="Primary">
              <a href="#">Campsites</a>
              <a href="#">Firewood</a>
              <a href="#">Bear Facts</a>
              <a href="#">Help</a>
            </nav>
          </div>
          <div className="treeline" aria-hidden="true" />
        </header>

        <main>{children}</main>

        <footer className="site-footer">
          <div className="footer-inner">
            <p className="footer-big">
              🌲 Please don&rsquo;t feed the sasquatch. He&rsquo;s on a diet. 🌲
            </p>
            <div className="footer-links">
              <a href="#">Campfire Rules</a>
              <a href="#">Refunds</a>
              <a href="#">Raccoon Policy</a>
              <a href="#">Contact</a>
            </div>
            <p className="footer-note">
              Demonstration environment — not a real campground, sadly. Credentials are
              verified against the BC Digital Trust sandbox ledger.
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
