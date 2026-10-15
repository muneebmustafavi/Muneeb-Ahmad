/**
 * Product hotspots: variant selection, accessible dialogs and Dawn cart updates.
 * One controller per grid; duplicate script loads and editor re-renders are safe.
 */
(() => {
  if (window.ggProductHotspotsController) {
    window.ggProductHotspotsController.boot();
    return;
  }

  const grids = new Map();
  const inertElements = new Map();
  let active = null;
  let previousOverflow = '';

  function cartUrl() {
    const root = window.Shopify?.routes?.root ?? '/';
    return `${root.endsWith('/') ? root : `${root}/`}cart`;
  }

  function feedback(state, message = '', isError = false, showCartLink = false) {
    state.message.classList.toggle('is-error', isError);
    state.message.replaceChildren();
    if (!message && !showCartLink) return;
    if (message) state.message.append(document.createTextNode(message));
    if (!showCartLink || isError) return;
    const link = document.createElement('a');
    link.href = cartUrl();
    link.className = 'gg-cart-link';
    link.textContent = 'Open Cart';
    state.message.append(document.createTextNode(' '), link);
  }

  function setDropdown(option, isOpen) {
    const dropdown = option.querySelector('.gg-size');
    if (!dropdown) return;
    dropdown.classList.toggle('is-open', isOpen);
    dropdown.querySelector('.gg-size-btn').setAttribute('aria-expanded', String(isOpen));
  }

  function matches(state, variant, selections = state.selections) {
    return state.optionCount === 0 || selections.every((value, index) => {
      return value == null || variant.options[index] === value;
    });
  }

  // Disable unavailable values using preceding choices. This avoids locking the
  // customer into a color merely because a size from the previous color is invalid.
  function updateVariant(state) {
    const hasStock = state.variants.some(variant => variant.available);
    state.optionGroups.forEach((group) => {
      const index = Number(group.dataset.optionIndex);
      const buttons = [...group.querySelectorAll('[data-option-value]')];
      buttons.forEach((button) => {
        const possible = state.variants.some((variant) => {
          return variant.available && variant.options[index] === button.dataset.optionValue &&
            state.selections.every((value, prior) => prior >= index || value == null || variant.options[prior] === value);
        });
        button.disabled = state.busy || !possible;
        button.dataset.available = String(possible);
      });
      const chosen = buttons.find(button => button.dataset.optionValue === state.selections[index]);
      if (chosen?.dataset.available === 'false') state.selections[index] = null;
      const available = buttons.filter(button => button.dataset.available === 'true');
      if (state.selections[index] == null && available.length === 1) {
        state.selections[index] = available[0].dataset.optionValue;
      }
      buttons.forEach((button) => {
        const selected = button.dataset.optionValue === state.selections[index];
        button.classList.toggle('is-selected', selected);
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const colors = group.querySelector('.gg-colors');
      if (colors) {
        const selectedIndex = buttons.findIndex(button => button.dataset.optionValue === state.selections[index]);
        colors.style.setProperty('--slide-i', String(Math.max(0, selectedIndex)));
        colors.classList.toggle('has-selection', selectedIndex >= 0);
      }
      const label = group.querySelector('.gg-size-label');
      if (label) {
        label.textContent = state.selections[index] ?? label.dataset.placeholder;
        group.querySelector('.gg-size').classList.toggle('has-value', state.selections[index] != null);
        group.querySelector('.gg-size-btn').disabled = state.busy || !hasStock;
      }
    });

    const complete = state.selections.every(value => value != null);
    const candidates = state.variants.filter(variant => matches(state, variant));
    state.variant = complete ? candidates[0] ?? null : null;
    const priced = candidates.filter(variant => variant.available);
    const lowest = (priced.length ? priced : candidates).reduce((best, variant) => {
      return !best || variant.price < best.price ? variant : best;
    }, null);
    const price = state.variant ?? lowest;
    if (price) {
      const from = !complete && candidates.some(variant => variant.price !== price.price);
      // Shopify formats every price in Liquid for the current market/currency.
      state.price.innerHTML = (from ? 'From ' : '') + price.formattedPrice;
    }
    state.atc.disabled = state.busy || state.requiresSellingPlan || !state.variant?.available;
    state.atc.setAttribute('aria-busy', String(state.busy));
    state.atc.querySelector('span').textContent = state.busy ? 'Adding…' :
      state.requiresSellingPlan ? 'View purchase options' : !hasStock ? 'Sold out' :
      !complete ? 'Choose options' : !state.variant?.available ? 'Unavailable' : 'Add to cart';
    if (!state.busy && !hasStock) feedback(state, 'This product is currently sold out.');
  }

  function focusable(pop) {
    return [...pop.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
      .filter(element => !element.disabled && element.getClientRects().length > 0);
  }

  function isolateDialog(pop, backdrop) {
    let branch = pop;
    // Inert siblings at every ancestor level, while leaving the backdrop clickable.
    while (branch.parentElement) {
      [...branch.parentElement.children].forEach((element) => {
        if (element === branch || element === backdrop || /^(SCRIPT|STYLE|LINK)$/.test(element.tagName)) return;
        inertElements.set(element, element.inert);
        element.inert = true;
      });
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  function closeModal(restoreFocus = true) {
    if (!active) return;
    const state = active;
    active = null;
    inertElements.forEach((wasInert, element) => { element.inert = wasInert; });
    inertElements.clear();
    document.body.style.overflow = previousOverflow;
    state.pop.classList.remove('is-center');
    state.pop.setAttribute('aria-hidden', 'true');
    state.plus.setAttribute('aria-expanded', 'false');
    state.spot.classList.remove('is-open');
    state.spot.removeAttribute('data-pinned');
    state.optionGroups.forEach(group => setDropdown(group, false));
    state.plus.insertAdjacentElement('afterend', state.pop);
    if (state.backdrop) state.backdrop.hidden = true;
    if (restoreFocus && state.plus.isConnected) state.plus.focus({ preventScroll: true });
  }

  function openModal(state) {
    closeModal(false);
    active = state;
    state.spot.classList.add('is-open');
    state.spot.setAttribute('data-pinned', 'true');
    state.plus.setAttribute('aria-expanded', 'true');
    state.pop.classList.add('is-center');
    state.pop.setAttribute('aria-hidden', 'false');
    state.section.appendChild(state.pop);
    if (state.backdrop) state.backdrop.hidden = false;
    // Centered cards deliberately keep a readable 1px unit at every screen width.
    updateVariant(state);
    isolateDialog(state.pop, state.backdrop);
    (focusable(state.pop)[0] ?? state.pop).focus({ preventScroll: true });
  }

  function patchCartCount(html) {
    if (!html) return;
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const target = document.getElementById('cart-icon-bubble');
    const content = parsed.querySelector('#cart-icon-bubble') ?? parsed.querySelector('.shopify-section');
    if (target && content) target.innerHTML = content.innerHTML;
  }

  async function addToCart(state) {
    if (state.busy || !state.variant?.available || state.requiresSellingPlan) return;
    const variant = state.variant;
    const cart = document.querySelector('cart-drawer') ?? document.querySelector('cart-notification');
    const sectionIds = [...new Set([
      ...(cart?.getSectionsToRender?.() ?? []).map(section => section.id), 'cart-icon-bubble'
    ])].slice(0, 5);
    state.busy = true;
    feedback(state);
    updateVariant(state);
    let added = false;

    try {
      const routeRoot = window.Shopify?.routes?.root ?? '/';
      const response = await fetch(routeRoot + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ id: variant.id, quantity: 1, sections: sectionIds, sections_url: window.location.pathname })
      });
      const data = await response.json();
      if (!response.ok || data.status >= 400) {
        throw new Error(typeof data.description === 'string' ? data.description : data.message ?? 'Unable to add this item. Please try again.');
      }
      added = true;
      feedback(state, 'Added to cart.', false, true);
      patchCartCount(data.sections?.['cart-icon-bubble']);

      if (cart?.renderContents && sectionIds.every(id => typeof data.sections?.[id] === 'string')) {
        // Release our focus trap before Dawn opens and manages its own drawer.
        closeModal();
        cart.setActiveElement?.(state.plus);
        cart.classList.remove('is-empty');
        cart.renderContents(data);
      } else if (cart?.renderContents) {
        feedback(state, 'Added to cart.', false, true);
      }
      document.dispatchEvent(new CustomEvent('gg:cart-added', { detail: { variantId: variant.id, cartData: data } }));
      if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'product-hotspots', productVariantId: variant.id, cartData: data });
      }
    } catch (error) {
      // A drawer rendering failure must not tell the customer the add failed:
      // retrying an already-successful add could create an unwanted duplicate.
      feedback(state, added ? 'Added to cart.' :
        error.message || 'Connection error. Please try again.', !added, added);
    } finally {
      state.busy = false;
      updateVariant(state);
    }
  }

  function initGrid(root) {
    if (grids.has(root)) return;
    const section = root.closest('.shopify-section') ?? root.parentElement;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const states = [];
    const backdrop = section.querySelector('[data-gg-backdrop]');

    root.querySelectorAll('[data-gg-spot]').forEach((spot) => {
      const plus = spot.querySelector('.gg-plus');
      const pop = spot.querySelector('.gg-pop');
      if (!plus || !pop) return;
      let data;
      try { data = JSON.parse(pop.querySelector('.gg-variants').textContent); }
      catch { return; }
      if (!Array.isArray(data.variants)) return;
      const state = {
        root, section, backdrop, spot, plus, pop,
        variants: data.variants, optionCount: data.optionCount,
        requiresSellingPlan: data.requiresSellingPlan,
        selections: Array(data.optionCount).fill(null), busy: false,
        optionGroups: [...pop.querySelectorAll('.gg-option')],
        price: pop.querySelector('.gg-pop-price'), message: pop.querySelector('.gg-pop-feedback'), atc: pop.querySelector('.gg-atc')
      };
      states.push(state);
      updateVariant(state);
      plus.addEventListener('click', () => active === state ? closeModal() : openModal(state), options);
      pop.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('.gg-pop-close')) { closeModal(); return; }
        const optionButton = target.closest('[data-option-value]');
        if (optionButton && !optionButton.disabled && !state.busy) {
          const group = optionButton.closest('.gg-option');
          state.selections[Number(group.dataset.optionIndex)] = optionButton.dataset.optionValue;
          setDropdown(group, false);
          feedback(state);
          updateVariant(state);
          group.querySelector('.gg-size-btn')?.focus({ preventScroll: true });
          return;
        }
        const dropdownButton = target.closest('.gg-size-btn');
        if (dropdownButton && !dropdownButton.disabled) {
          const group = dropdownButton.closest('.gg-option');
          const wasOpen = group.querySelector('.gg-size').classList.contains('is-open');
          state.optionGroups.forEach(option => setDropdown(option, false));
          setDropdown(group, !wasOpen);
          return;
        }
        if (target.closest('.gg-atc')) addToCart(state);
      }, options);
    });
    backdrop?.addEventListener('click', () => {
      if (active?.root === root) closeModal();
    }, options);
    grids.set(root, { controller, states });
  }

  function boot() {
    // Drop detached editor nodes and their listeners; pending cart requests still finish.
    grids.forEach((grid, root) => {
      if (!root.isConnected) {
        if (active?.root === root) closeModal(false);
        grid.controller.abort();
        grids.delete(root);
      }
    });
    document.querySelectorAll('[data-gg-grid]').forEach(initGrid);
  }

  window.ggProductHotspotsController = { boot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  document.addEventListener('keydown', (event) => {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    } else if (event.key === 'Tab') {
      const controls = focusable(active.pop);
      const first = controls[0] ?? active.pop;
      const last = controls.at(-1) ?? active.pop;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === active.pop)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === active.pop)) {
        event.preventDefault(); first.focus();
      }
    }
  });
  document.addEventListener('focusin', (event) => {
    if (active && !active.pop.contains(event.target)) (focusable(active.pop)[0] ?? active.pop).focus();
  });
  document.addEventListener('click', (event) => {
    if (active && !active.pop.contains(event.target) && !active.plus.contains(event.target)) closeModal();
  });
  document.addEventListener('shopify:section:load', boot);
  document.addEventListener('shopify:section:unload', (event) => {
    grids.forEach((grid, root) => {
      if (event.target.contains(root)) {
        if (active?.root === root) closeModal(false);
        grid.controller.abort();
        grids.delete(root);
      }
    });
  });
  document.addEventListener('shopify:block:select', (event) => {
    grids.forEach(grid => {
      const state = grid.states.find(item => item.spot.dataset.spotId === event.detail?.blockId);
      if (state) openModal(state);
    });
  });
  document.addEventListener('shopify:block:deselect', () => closeModal());
})();
