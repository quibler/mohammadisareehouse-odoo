/** @odoo-module */

import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { patch } from "@web/core/utils/patch";

/**
 * Simple ProductScreen Enhancement
 * - Price focus by default (main requirement)
 * - Keyboard shortcuts for selected order lines
 * - No interference with normal numpad functionality
 */

patch(ProductScreen.prototype, {

    setup() {
        super.setup();
        
        // Add keyboard shortcuts
        this.addKeyboardListener();
        
        // YOUR MAIN REQUIREMENT: Price focus by default
        this._setDefaultPriceMode();
        
        console.log("🎯 ProductScreen setup complete - Price focus enabled");
    },

    async addProductToOrder(product) {
        await super.addProductToOrder(product);
        
        // Set price focus after adding product
        this._setDefaultPriceMode();
        console.log("➕ Product added - Price focus set");
    },

    selectOrderline(orderline) {
        super.selectOrderline(orderline);
        
        // Set price focus when selecting order line  
        this._setDefaultPriceMode();
        console.log("👆 Order line selected - Price focus set");
    },

    /**
     * YOUR MAIN REQUIREMENT: Set price mode as default
     * @private
     */
    _setDefaultPriceMode() {
        if (this.pos?.cashierHasPriceControlRights?.()) {
            this.pos.numpadMode = "price";
        }
    },

    /**
     * Add keyboard shortcuts for order line qty changes
     */
    addKeyboardListener() {
        document.addEventListener('keydown', this.handleKeyboardInput.bind(this));
    },

    /**
     * Handle keyboard shortcuts ONLY for selected order lines
     * NEVER interfere with numpad usage
     */
    handleKeyboardInput(event) {
        // CRITICAL: Never interfere with input fields
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // CRITICAL: Never interfere when using numpad buttons
        if (this.pos?.numpadMode === "quantity" || this.pos?.numpadMode === "discount") {
            console.log(`🔢 ${this.pos.numpadMode} mode active - keyboard shortcuts disabled`);
            return;
        }
        
        // CRITICAL: Never interfere when focus is on numpad area
        if (event.target.closest('.actionpad, .numpad, .control-buttons')) {
            return;
        }
        
        // Only work when order line is selected
        const order = this.pos?.get_order?.();
        const selectedLine = order?.get_selected_orderline?.();
        if (!selectedLine) return;
        
        // Only work when order line is visually selected
        const selectedElement = document.querySelector('.orderline.selected');
        if (!selectedElement) return;

        let handled = false;

        switch(event.key) {
            case 'ArrowUp':
            case '+':
                event.preventDefault();
                this.incrementQuantity(selectedLine);
                handled = true;
                break;
            case 'ArrowDown':
            case '-':
                event.preventDefault();
                this.decrementQuantity(selectedLine);
                handled = true;
                break;
        }

        if (handled) {
            // Visual feedback
            selectedElement.style.backgroundColor = '#81c784';
            setTimeout(() => {
                selectedElement.style.backgroundColor = '';
            }, 200);
            console.log(`⚡ Keyboard shortcut used: ${event.key}`);
        }
    },

    /**
     * Increment quantity by 1
     */
    incrementQuantity(orderline) {
        const newQty = orderline.get_quantity() + 1;
        orderline.set_quantity(newQty);
    },

    /**
     * Decrement quantity by 1 (delete if reaches 0)
     */
    decrementQuantity(orderline) {
        const currentQty = orderline.get_quantity();
        if (currentQty > 1) {
            orderline.set_quantity(currentQty - 1);
        } else {
            // Delete line if quantity would be 0
            this.deleteOrderLine(orderline);
        }
    },

    /**
     * Delete order line with proper method detection
     */
    deleteOrderLine(orderline) {
        const order = this.pos.get_order();
        
        if (typeof order.removeOrderline === 'function') {
            order.removeOrderline(orderline);
        } else if (typeof order.remove_orderline === 'function') {
            order.remove_orderline(orderline);
        } else {
            // Fallback: set quantity to 0
            orderline.set_quantity(0);
        }
    }
});