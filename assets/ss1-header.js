/* SS1 Header: accessible mobile panel, without jQuery. Sizing is handled by CSS. */
(() => {
  if (customElements.get('ss1-header')) return;

  class SS1Header extends HTMLElement {
    connectedCallback() {
      this.controller?.abort();
      this.controller = new AbortController();
      this.toggle = this.querySelector('.ss1-menu-toggle');
      this.menu = this.querySelector('.ss1-mobile-menu');
      this.mobileViewport = window.matchMedia('(max-width: 900px)');
      const options = { signal: this.controller.signal };

      this.setMenuOpen(false);

      this.toggle.addEventListener('click', () => {
        this.setMenuOpen(this.toggle.getAttribute('aria-expanded') !== 'true');
      }, options);

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.toggle.getAttribute('aria-expanded') === 'true') {
          this.setMenuOpen(false);
          this.toggle.focus();
        }
      }, options);

      document.addEventListener('click', (event) => {
        if (!this.contains(event.target)) this.setMenuOpen(false);
      }, options);

      this.mobileViewport.addEventListener('change', (event) => {
        if (!event.matches) this.setMenuOpen(false);
      }, options);

      // Reveal the mobile panel while the merchant edits/selects this section.
      this.closest('.shopify-section')?.addEventListener('shopify:section:select', () => {
        if (this.mobileViewport.matches) this.setMenuOpen(true);
      }, options);

      this.closest('.shopify-section')?.addEventListener('shopify:section:deselect', () => {
        this.setMenuOpen(false);
      }, options);
    }

    setMenuOpen(isOpen) {
      this.toggle.setAttribute('aria-expanded', String(isOpen));
      this.toggle.setAttribute('aria-label', isOpen ? 'Close gift menu' : 'Open gift menu');
      this.menu.setAttribute('aria-hidden', String(!isOpen));
      this.menu.inert = !isOpen;
      this.menu.classList.toggle('is-open', isOpen);
    }

    disconnectedCallback() {
      this.controller?.abort();
    }
  }

  customElements.define('ss1-header', SS1Header);
})();
