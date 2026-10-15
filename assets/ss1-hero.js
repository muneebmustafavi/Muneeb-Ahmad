/* SS1 Hero: independent section controller.
 * Layout and button animation are CSS-driven, including wide-screen scaling.
 * Kept as a separate asset for future section interactions.
 */
(() => {
  if (customElements.get('ss1-hero')) return;

  class SS1Hero extends HTMLElement {}

  customElements.define('ss1-hero', SS1Hero);
})();
