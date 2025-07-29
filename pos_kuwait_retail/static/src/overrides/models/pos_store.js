/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";

/**
 * HIJACK STRATEGY: Replace all automatic qty mode with price mode
 * But respect manual user clicks on qty button
 */

// Global flags to track manual user interactions
let isManualClick = false;
let manualClickTime = 0;

// 1. Override ActionPad to detect manual clicks
patch(ActionpadWidget.prototype, {

    setup() {
        super.setup();

        onMounted(() => {
            this._interceptQtyButton();
            this._observeButtonChanges();
        });
    },

    /**
     * Watch for DOM changes to catch qty button when it's added
     */
    _observeButtonChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            const buttons = node.querySelectorAll ? node.querySelectorAll('button') : [];
                            Array.from(buttons).forEach(btn => {
                                const text = btn.textContent.trim().toLowerCase();
                                if ((text === 'qty' || text === 'quantity') && !btn._qtyIntercepted) {
                                    this._addQtyListener(btn);
                                }
                            });
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this._buttonObserver = observer;
    },

    /**
     * Add click listener to qty button
     */
    _addQtyListener(qtyButton) {
        qtyButton._qtyIntercepted = true;

        qtyButton.addEventListener('click', (e) => {
            isManualClick = true;
            manualClickTime = Date.now();

            if (this.pos) {
                this.pos._numpadMode = "quantity";
            }

            setTimeout(() => {
                isManualClick = false;
            }, 3000);
        });
    },

    /**
     * Intercept qty button clicks
     */
    _interceptQtyButton() {
        const searchAttempts = [100, 500, 1000, 2000, 3000];

        searchAttempts.forEach(delay => {
            setTimeout(() => {
                this._findAndInterceptQtyButton();
            }, delay);
        });
    },

    /**
     * Find qty button using multiple search strategies
     */
    _findAndInterceptQtyButton() {
        let qtyButton = document.querySelector('button[data-mode="quantity"]');

        if (!qtyButton) {
            qtyButton = document.querySelector('button[value="Qty"]');
        }

        if (!qtyButton) {
            qtyButton = document.querySelector('button.numpad-qty');
        }

        if (!qtyButton) {
            const allButtons = document.querySelectorAll('button');
            qtyButton = Array.from(allButtons).find(btn => {
                const text = btn.textContent.trim().toLowerCase();
                return text === 'qty' || text === 'quantity';
            });
        }

        if (!qtyButton) {
            const actionPad = document.querySelector('.actionpad, .action-pad, .numpad-buttons');
            if (actionPad) {
                const buttons = actionPad.querySelectorAll('button');
                qtyButton = Array.from(buttons).find(btn => {
                    const text = btn.textContent.trim().toLowerCase();
                    return text === 'qty' || text === 'quantity';
                });
            }
        }

        if (qtyButton && !qtyButton._qtyIntercepted) {
            this._addQtyListener(qtyButton);
        }
    },

    /**
     * Override changeMode
     */
    changeMode(mode) {
        return super.changeMode(mode);
    }
});

// 2. Override PosStore to hijack automatic quantity mode settings
patch(PosStore.prototype, {

    /**
     * HIJACK: Replace all automatic qty mode with price mode
     * EXCEPT when user manually clicks qty button
     */
    set numpadMode(mode) {
        const timeSinceManualClick = Date.now() - manualClickTime;
        const isRecentManualClick = isManualClick && timeSinceManualClick < 3000;

        if (mode === "quantity") {
            if (isRecentManualClick) {
                this._numpadMode = "quantity";
            } else if (this._canUsePriceMode()) {
                this._numpadMode = "price";
            } else {
                this._numpadMode = "quantity";
            }
        } else {
            if (isRecentManualClick && this._numpadMode === "quantity") {
                // Don't change from quantity if user just clicked qty button
            } else {
                this._numpadMode = mode;
            }
        }

        setTimeout(() => {
            this._updateModeVisuals();
        }, 50);
    },

    /**
     * Override getter to default to price
     */
    get numpadMode() {
        if (!this._numpadMode && this._canUsePriceMode()) {
            this._numpadMode = "price";
        }
        return this._numpadMode || "quantity";
    },

    /**
     * Update visual state of mode buttons
     */
    _updateModeVisuals() {
        const currentMode = this._numpadMode;

        const qtyBtn = document.querySelector('button[data-mode="quantity"]') ||
                      document.querySelector('button[value="Qty"]') ||
                      Array.from(document.querySelectorAll('button')).find(btn =>
                          btn.textContent.trim().toLowerCase() === 'qty'
                      );

        const priceBtn = document.querySelector('button[data-mode="price"]') ||
                        document.querySelector('button[value="Price"]') ||
                        Array.from(document.querySelectorAll('button')).find(btn =>
                            btn.textContent.trim().toLowerCase() === 'price'
                        );

        if (qtyBtn) {
            if (currentMode === "quantity") {
                qtyBtn.classList.add('active');
            } else {
                qtyBtn.classList.remove('active');
            }
        }

        if (priceBtn) {
            if (currentMode === "price") {
                priceBtn.classList.add('active');
            } else {
                priceBtn.classList.remove('active');
            }
        }
    },

    /**
     * Check if price mode is available
     */
    _canUsePriceMode() {
        try {
            return this.config &&
                   this.user &&
                   this.ready &&
                   typeof this.cashierHasPriceControlRights === 'function' &&
                   this.cashierHasPriceControlRights();
        } catch (e) {
            return false;
        }
    }
});

// 3. ProductScreen with keyboard shortcuts
patch(ProductScreen.prototype, {

    setup() {
        super.setup();
        this.addKeyboardListener();
    },



    /**
     * Add keyboard shortcuts for quantity changes
     */
    addKeyboardListener() {
        // Track last event to prevent duplicates
        let lastEventTime = 0;
        let lastEventKey = '';

        const handleArrowKeys = (event) => {
            // Only process arrow keys and +/-
            if (!['ArrowUp', 'ArrowDown', '+', '-'].includes(event.key)) {
                return;
            }

            // Debounce: prevent duplicate events within 100ms
            const now = Date.now();
            if (now - lastEventTime < 100 && lastEventKey === event.key) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return false;
            }
            lastEventTime = now;
            lastEventKey = event.key;

            // Skip if typing in inputs
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            // Get the current order and find selected line or use the last line
            const order = this.pos?.get_order?.();
            if (!order) return;

            let targetLine = order.get_selected_orderline();

            // If no line is selected, use the last/newest line
            if (!targetLine) {
                const orderlines = order.get_orderlines();
                if (orderlines && orderlines.length > 0) {
                    targetLine = orderlines[orderlines.length - 1];
                    order.select_orderline(targetLine);
                }
            }

            if (!targetLine) return;

            // Block other handlers
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // Calculate new quantity
            const currentQty = targetLine.get_quantity();
            let newQty;

            if (event.key === 'ArrowUp' || event.key === '+') {
                newQty = currentQty + 1;
            } else if (event.key === 'ArrowDown' || event.key === '-') {
                newQty = Math.max(0, currentQty - 1);
            }

            // Set quantity
            try {
                targetLine.set_quantity(newQty);
            } catch (error) {
                // Silently handle errors
            }

            return false;
        };

        document.addEventListener('keydown', handleArrowKeys, {
            capture: true,
            passive: false
        });

        setTimeout(() => {
            this._overrideOdooNumpadHandlers();
        }, 1000);
    },

    /**
     * Override Odoo's numpad-specific keyboard handling
     */
    _overrideOdooNumpadHandlers() {
        // Look for numpad or actionpad elements and override their keyboard handling
        const numpadElement = document.querySelector('.numpad, .actionpad');
        if (numpadElement) {
            const originalKeydown = numpadElement.onkeydown;
            const originalKeyup = numpadElement.onkeyup;

            numpadElement.onkeydown = (event) => {
                if (['ArrowUp', 'ArrowDown', '+', '-'].includes(event.key)) {
                    // Let our handler deal with arrow keys
                    return false;
                }
                if (originalKeydown) {
                    return originalKeydown.call(numpadElement, event);
                }
            };

            numpadElement.onkeyup = (event) => {
                if (['ArrowUp', 'ArrowDown', '+', '-'].includes(event.key)) {
                    // Let our handler deal with arrow keys
                    return false;
                }
                if (originalKeyup) {
                    return originalKeyup.call(numpadElement, event);
                }
            };
        }
    },

    /**
     * Handle keyboard shortcuts for quantity changes
     * Arrow keys ALWAYS change quantity regardless of current numpad mode
     */
    handleKeyboardInput(event) {
        // Never interfere with input fields
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // Never interfere when using numpad buttons
        if (event.target.closest('.actionpad, .numpad, .control-buttons')) {
            return;
        }

        // Only work when order line is selected
        const order = this.pos?.get_order?.();
        const selectedLine = order?.get_selected_orderline?.();

        if (!selectedLine || !order) {
            return;
        }

        // Arrow keys ALWAYS change quantity - FORCE this behavior
        let handled = false;

        switch(event.key) {
            case 'ArrowUp':
            case '+':
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                this._adjustLineQuantity(selectedLine, 1);
                handled = true;
                break;

            case 'ArrowDown':
            case '-':
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                this._adjustLineQuantity(selectedLine, -1);
                handled = true;
                break;
        }

        // Ctrl+number shortcuts for quick quantity (also force these)
        if (event.ctrlKey && !handled) {
            switch(event.key) {
                case '1':
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    this._setLineQuantity(selectedLine, 1);
                    handled = true;
                    break;
                case '2':
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    this._setLineQuantity(selectedLine, 2);
                    handled = true;
                    break;
                case '5':
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    this._setLineQuantity(selectedLine, 5);
                    handled = true;
                    break;
                case '0':
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    this._setLineQuantity(selectedLine, 10);
                    handled = true;
                    break;
                case 'Delete':
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    this._deleteLine(selectedLine, order);
                    handled = true;
                    break;
            }
        }

        // If we handled the event, return false to ensure it doesn't bubble
        if (handled) {
            return false;
        }
    },

    /**
     * Adjust order line quantity - SAFE with line removal
     */
    _adjustLineQuantity(line, delta) {
        const currentQty = line.get_quantity();
        const newQty = currentQty + delta;

        if (newQty < 0) {
            // Don't allow negative quantities
            return;
        } else if (newQty === 0) {
            // Set to 0 first
            line.set_quantity(0);
        } else if (currentQty === 0 && delta < 0) {
            // If already at 0 and trying to decrease, remove the line
            const order = this.pos?.get_order?.();
            if (order && typeof order.remove_orderline === 'function') {
                order.remove_orderline(line);
            }
        } else {
            // Normal quantity change
            line.set_quantity(newQty);
        }
    },

    /**
     * Set specific quantity
     */
    _setLineQuantity(line, qty) {
        line.set_quantity(qty);
    },

    /**
     * Delete order line
     */
    _deleteLine(line, order) {
        if (order && typeof order.remove_orderline === 'function') {
            order.remove_orderline(line);
        }
    }
});