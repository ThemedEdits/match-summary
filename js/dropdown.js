/**
 * CricSnap Custom Dropdown
 * ========================
 * Replaces ALL <select> elements with a curtain-style animated dropdown.
 * 
 * Usage:
 *   1. Include this script: <script type="module" src="../js/dropdown.js"></script>
 *   2. Call initDropdowns() after DOM is ready, or after dynamically adding selects.
 *   3. To re-init a specific container: initDropdowns(containerEl)
 *   4. To programmatically set a value: setDropdownValue(selectEl, value)
 *   5. To get current value: the original <select> stays in sync, read select.value normally.
 * 
 * Features:
 *   - Curtain unfold from top animation
 *   - Supports optgroup (renders as section headers)
 *   - Keyboard accessible (arrow keys, enter, escape)
 *   - Searchable for long lists (> 8 options)
 *   - Auto-closes on outside click
 *   - Syncs value back to original <select> (so existing onchange handlers still fire)
 *   - Works with dynamically added options
 */

const INITIALIZED_ATTR = 'data-cs-dropdown-init';

export function initDropdowns(root = document) {
  root.querySelectorAll(`select:not([${INITIALIZED_ATTR}])`).forEach(sel => buildDropdown(sel));
}

export function setDropdownValue(selectEl, value) {
  selectEl.value = value;
  const wrapper = selectEl.closest('.cs-select-wrapper') || document.querySelector(`.cs-select-wrapper[data-for="${selectEl.id}"]`);
  if (!wrapper) return;
  const opt = [...selectEl.options].find(o => o.value === value);
  if (opt) wrapper.querySelector('.cs-trigger-label').textContent = opt.textContent;
}

// Close all open dropdowns
function closeAll(except = null) {
  document.querySelectorAll('.cs-dropdown.open').forEach(dd => {
    if (dd !== except) closeDropdown(dd);
  });
}

function closeDropdown(dd) {
  dd.classList.remove('open');
  const list = dd.querySelector('.cs-list');
  list.style.animationName = 'csUnfoldOut';
  setTimeout(() => {
    dd.classList.remove('visible');
    list.style.animationName = '';
  }, 220);
}

function openDropdown(dd) {
  closeAll(dd);
  dd.classList.add('open', 'visible');
  const list = dd.querySelector('.cs-list');
  list.style.animationName = 'csUnfoldIn';

  // Position: flip up if near bottom of viewport
  const trigger = dd.querySelector('.cs-trigger');
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 280 && rect.top > 280) {
    dd.classList.add('flip-up');
  } else {
    dd.classList.remove('flip-up');
  }

  // Focus search if present
  const search = dd.querySelector('.cs-search');
  if (search) { search.value = ''; search.focus(); filterOptions(dd, ''); }

  // Scroll selected item into view
  const selected = dd.querySelector('.cs-option.selected');
  if (selected) setTimeout(() => selected.scrollIntoView({ block: 'nearest' }), 50);
}

function buildDropdown(select) {
  select.setAttribute(INITIALIZED_ATTR, '1');
  select.style.display = 'none';

  const needsSearch = select.options.length > 8;

  // Wrapper replaces the select visually
  const wrapper = document.createElement('div');
  wrapper.className = 'cs-select-wrapper';
  if (select.id) wrapper.dataset.for = select.id;
  if (select.disabled) wrapper.classList.add('disabled');

  // Trigger button
  const trigger = document.createElement('div');
  trigger.className = 'cs-trigger';
  trigger.setAttribute('tabindex', '0');
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'listbox');

  const selectedOpt = select.options[select.selectedIndex];
  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'cs-trigger-label';
  triggerLabel.textContent = selectedOpt ? selectedOpt.text : '—';

  const chevron = document.createElement('span');
  chevron.className = 'cs-chevron';
  chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

  trigger.appendChild(triggerLabel);
  trigger.appendChild(chevron);

  // Dropdown panel
  const dropdown = document.createElement('div');
  dropdown.className = 'cs-dropdown';
  dropdown.setAttribute('role', 'listbox');

  // Search box for long lists
  if (needsSearch) {
    const searchWrap = document.createElement('div');
    searchWrap.className = 'cs-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.className = 'cs-search';
    searchInput.placeholder = 'Search...';
    searchInput.setAttribute('type', 'text');
    searchInput.addEventListener('input', (e) => filterOptions(dropdown, e.target.value));
    searchInput.addEventListener('keydown', (e) => handleSearchKey(e, dropdown, select));
    searchWrap.appendChild(searchInput);
    dropdown.appendChild(searchWrap);
  }

  const list = document.createElement('div');
  list.className = 'cs-list';
  dropdown.appendChild(list);

  // Build option items from original select
  buildOptions(list, select, triggerLabel);

  wrapper.appendChild(trigger);
  wrapper.appendChild(dropdown);

  // Insert wrapper after the select
  select.parentNode.insertBefore(wrapper, select.nextSibling);
  wrapper.insertBefore(select, wrapper.firstChild); // keep select inside wrapper

  // Toggle open/close
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wrapper.classList.contains('disabled')) return;
    if (dropdown.classList.contains('open')) closeDropdown(dropdown);
    else openDropdown(dropdown);
    trigger.setAttribute('aria-expanded', dropdown.classList.contains('open'));
  });

  // Keyboard on trigger
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openDropdown(dropdown);
    } else if (e.key === 'Escape') {
      closeDropdown(dropdown);
    }
  });

  // Stop clicks inside dropdown from closing it
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  // Watch for external changes to select.value (e.g. programmatic)
  const observer = new MutationObserver(() => {
    const opt = select.options[select.selectedIndex];
    if (opt) triggerLabel.textContent = opt.text;
    updateSelectedState(list, select.value);
  });
  observer.observe(select, { attributes: true, childList: true, subtree: true });
}

function buildOptions(list, select, triggerLabel) {
  list.innerHTML = '';
  const children = [...select.children];

  children.forEach(child => {
    if (child.tagName === 'OPTGROUP') {
      const groupHeader = document.createElement('div');
      groupHeader.className = 'cs-optgroup-label';
      groupHeader.textContent = child.label;
      list.appendChild(groupHeader);

      [...child.children].forEach(opt => {
        list.appendChild(buildOptionEl(opt, select, triggerLabel, list));
      });
    } else if (child.tagName === 'OPTION') {
      list.appendChild(buildOptionEl(child, select, triggerLabel, list));
    }
  });
}

function buildOptionEl(opt, select, triggerLabel, list) {
  const item = document.createElement('div');
  item.className = 'cs-option';
  item.dataset.value = opt.value;
  item.textContent = opt.text;
  if (!opt.value) item.classList.add('cs-option-placeholder');
  if (opt.value === select.value) item.classList.add('selected');
  if (opt.disabled) item.classList.add('disabled');

  item.addEventListener('click', () => {
    if (item.classList.contains('disabled') || item.classList.contains('cs-option-placeholder') && !opt.value) return;
    select.value = opt.value;
    triggerLabel.textContent = opt.text;
    updateSelectedState(list, opt.value);

    // Fire change event on original select so existing handlers still work
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const dropdown = list.closest('.cs-dropdown');
    closeDropdown(dropdown);
  });

  return item;
}

function updateSelectedState(list, value) {
  list.querySelectorAll('.cs-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === value);
  });
}

function filterOptions(dropdown, query) {
  const q = query.toLowerCase();
  dropdown.querySelectorAll('.cs-option').forEach(o => {
    const match = o.textContent.toLowerCase().includes(q);
    o.style.display = match ? '' : 'none';
  });
  dropdown.querySelectorAll('.cs-optgroup-label').forEach(g => {
    // Hide group header if all its options are hidden
    let next = g.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('cs-optgroup-label')) {
      if (next.style.display !== 'none') hasVisible = true;
      next = next.nextElementSibling;
    }
    g.style.display = hasVisible ? '' : 'none';
  });
}

function handleSearchKey(e, dropdown, select) {
  const items = [...dropdown.querySelectorAll('.cs-option:not([style*="display: none"])')];
  const focused = dropdown.querySelector('.cs-option.focused');
  let idx = items.indexOf(focused);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (focused) focused.classList.remove('focused');
    const next = items[Math.min(idx + 1, items.length - 1)];
    if (next) { next.classList.add('focused'); next.scrollIntoView({ block: 'nearest' }); }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (focused) focused.classList.remove('focused');
    const prev = items[Math.max(idx - 1, 0)];
    if (prev) { prev.classList.add('focused'); prev.scrollIntoView({ block: 'nearest' }); }
  } else if (e.key === 'Enter' && focused) {
    e.preventDefault();
    focused.click();
  } else if (e.key === 'Escape') {
    closeDropdown(dropdown.closest('.cs-dropdown') || dropdown);
  }
}

// Close on outside click or scroll
document.addEventListener('click', () => closeAll());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initDropdowns());
} else {
  initDropdowns();
}