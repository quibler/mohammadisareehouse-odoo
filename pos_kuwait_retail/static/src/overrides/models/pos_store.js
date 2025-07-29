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

// 1. Override ActionPad to detect manual clicks and prevent price forcing
patch(ActionpadWidget.prototype, {

    setup() {
        super.setup();

        onMounted(() => {
            // Start intercepting qty button immediately
            this._interceptQtyButton();

            // Also add mutation observer to catch dynamically added buttons
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
                        if (node.nodeType === 1) { // Element node
                            // Check if the added node or its children contain qty button
                            const buttons = node.querySelectorAll ? node.querySelectorAll('button') : [];
                            Array.from(buttons).forEach(btn => {
                                const text = btn.textContent.trim().toLowerCase();
                                if ((text === 'qty' || text === 'quantity') && !btn._qtyIntercepted) {
                                    console.log("🎯 Mutation observer found qty button:", btn);
                                    this._addQtyListener(btn);
                                }
                            });
                        }
                    });
                }
            });
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Store reference to disconnect later if needed
        this._buttonObserver = observer;
    },

    /**
     * Add click listener to qty button
     */
    _addQtyListener(qtyButton) {
        console.log("🎯 Adding manual click detection to qty button:", qtyButton);

        // Mark as intercepted to avoid duplicate listeners
        qtyButton._qtyIntercepted = true;

        // Add click listener to detect manual clicks
        qtyButton.addEventListener('click', (e) => {
            console.log("🖱️ MANUAL QTY BUTTON CLICK DETECTED");
            isManualClick = true;
            manualClickTime = Date.now();

            // Force quantity mode immediately
            if (this.pos) {
                this.pos._numpadMode = "quantity";
                console.log("🎯 FORCED quantity mode after manual click");
            }

            // Reset flag after sufficient time
            setTimeout(() => {
                isManualClick = false;
                console.log("🔄 Manual click flag reset");
            }, 3000); // Increased to 3 seconds for safety
        });
    },

    /**
     * Intercept qty button clicks to mark them as manual
     * Use multiple attempts with different delays and search strategies
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
        // Strategy 1: Find by data-mode
        let qtyButton = document.querySelector('button[data-mode="quantity"]');

        // Strategy 2: Find by value attribute
        if (!qtyButton) {
            qtyButton = document.querySelector('button[value="Qty"]');
        }

        // Strategy 3: Find by class
        if (!qtyButton) {
            qtyButton = document.querySelector('button.numpad-qty');
        }

        // Strategy 4: Find by text content (most reliable)
        if (!qtyButton) {
            const allButtons = document.querySelectorAll('button');
            qtyButton = Array.from(allButtons).find(btn => {
                const text = btn.textContent.trim().toLowerCase();
                return text === 'qty' || text === 'quantity';
            });
        }

        // Strategy 5: Find inside ActionPad specifically
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
            console.log("🎯 Found qty button - adding manual click detection:", qtyButton);
            console.log("   Button text:", qtyButton.textContent.trim());
            console.log("   Button data-mode:", qtyButton.getAttribute('data-mode'));
            console.log("   Button classes:", qtyButton.className);

            this._addQtyListener(qtyButton);
        } else if (!qtyButton) {
            console.log("🔍 Still searching for qty button...");
        }
    },

    /**
     * Override changeMode - don't interfere with manual clicks
     */
    changeMode(mode) {
        if (mode === "quantity" && isManualClick) {
            console.log("🎯 Manual qty button click - allowing quantity mode");
        } else if (mode === "quantity") {
            console.log("🎯 Automatic qty mode detected - will be hijacked by PosStore");
        }

        // Call original method
        return super.changeMode(mode);
    }
});

// 2. Override PosStore to hijack ALL automatic quantity mode settings
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
                // User manually clicked qty button - respect their choice and block further changes
                console.log(`🎯 PosStore: Respecting manual qty button click (${timeSinceManualClick}ms ago)`);
                this._numpadMode = "quantity";
            } else if (this._canUsePriceMode()) {
                // Automatic qty mode - hijack it to price mode
                console.log("🎯 PosStore: HIJACKING automatic qty mode → price mode");
                this._numpadMode = "price";
            } else {
                // Fallback if price mode not available
                this._numpadMode = "quantity";
            }
        } else {
            // Not quantity mode - set normally (but check if it's overriding manual qty)
            if (isRecentManualClick && this._numpadMode === "quantity") {
                console.log(`🎯 PosStore: BLOCKING ${mode} mode - protecting manual qty choice`);
                // Don't change from quantity if user just clicked qty button
            } else {
                this._numpadMode = mode;
            }
        }

        console.log(`🎯 PosStore: Final mode set to ${this._numpadMode} (original: ${mode}, manual: ${isManualClick}, time: ${timeSinceManualClick}ms)`);

        // Add delay to ensure UI updates properly
        setTimeout(() => {
            this._updateModeVisuals();
        }, 50);
    },

    /**
     * Update visual state of mode buttons (minimal changes to preserve original styling)
     */
    _updateModeVisuals() {
        const currentMode = this._numpadMode;

        // Find the buttons
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

        // Only add/remove 'active' class to preserve original Odoo styling
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

        console.log(`🎨 Updated button states for ${currentMode} mode (minimal styling)`);
    },

    /**
     * Override getter to default to price
     */
    get numpadMode() {
        // If no mode set yet, default to price if available
        if (!this._numpadMode && this._canUsePriceMode()) {
            console.log("🎯 PosStore: No mode set - defaulting to price");
            this._numpadMode = "price";
        }
        return this._numpadMode || "quantity";
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

// 3. Restore ProductScreen with keyboard shortcuts
patch(ProductScreen.prototype, {

    setup() {
        super.setup();

        // Add keyboard shortcuts
        this.addKeyboardListener();

        console.log("🎯 ProductScreen setup complete with keyboard shortcuts");
    },

    /**
     * Add keyboard shortcuts for order line qty changes
     */
    addKeyboardListener() {
        document.addEventListener('keydown', this.handleKeyboardInput.bind(this));
    },

    /**
     * Handle keyboard shortcuts for quantity changes
     */
    handleKeyboardInput(event) {
        // CRITICAL: Never interfere with input fields
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // CRITICAL: Never interfere when using numpad buttons
        if (event.target.closest('.actionpad, .numpad, .control-buttons')) {
            return;
        }

        // Only work when order line is selected
        const order = this.pos?.get_order?.();
        const selectedLine = order?.get_selected_orderline?.();

        if (!selectedLine) {
            return;
        }

        // Handle keyboard shortcuts for selected order line
        switch(event.key) {
            case 'ArrowUp':
            case '+':
                event.preventDefault();
                this._adjustLineQuantity(selectedLine, 1);
                break;

            case 'ArrowDown':
            case '-':
                event.preventDefault();
                this._adjustLineQuantity(selectedLine, -1);
                break;
        }

        // Ctrl+number shortcuts for quick quantity
        if (event.ctrlKey) {
            switch(event.key) {
                case '1':
                    event.preventDefault();
                    this._setLineQuantity(selectedLine, 1);
                    break;
                case '2':
                    event.preventDefault();
                    this._setLineQuantity(selectedLine, 2);
                    break;
                case '5':
                    event.preventDefault();
                    this._setLineQuantity(selectedLine, 5);
                    break;
                case '0':
                    event.preventDefault();
                    this._setLineQuantity(selectedLine, 10);
                    break;
                case 'Delete':
                    event.preventDefault();
                    this._deleteLine(selectedLine);
                    break;
            }
        }
    },

    /**
     * Adjust order line quantity
     */
    _adjustLineQuantity(line, delta) {
        const newQty = Math.max(0, line.get_quantity() + delta);
        if (newQty === 0) {
            line.order.remove_orderline(line);
        } else {
            line.set_quantity(newQty);
        }
        console.log(`⚡ Keyboard: Set quantity to ${newQty}`);
    },

    /**
     * Set specific quantity
     */
    _setLineQuantity(line, qty) {
        line.set_quantity(qty);
        console.log(`⚡ Keyboard: Set quantity to ${qty}`);
    },

    /**
     * Delete order line
     */
    _deleteLine(line) {
        line.order.remove_orderline(line);
        console.log(`⚡ Keyboard: Deleted line`);
    }
});