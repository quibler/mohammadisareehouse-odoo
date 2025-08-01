/** @odoo-module */

import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";
import { patch } from "@web/core/utils/patch";

/**
 * Enhanced Order Line with Quick Quantity Controls
 * Adds +/- buttons and keyboard support for fast quantity changes
 * FIXED: Arrow keys only work on ProductScreen (order screen), not payment page
 */

patch(Orderline.prototype, {

    setup() {
        super.setup();

        // Add keyboard event listener for arrow keys and +/-
        this.addKeyboardListener();
    },

    /**
     * Add keyboard event listener for quick quantity changes
     */
    addKeyboardListener() {
        // Listen for keyboard events when this orderline is selected
        document.addEventListener('keydown', this.handleKeyboardInput.bind(this));
    },

    /**
     * Check if we're currently on the ProductScreen (order screen)
     */
    isOnOrderScreen() {
        // Check if we're on the product screen (order screen)
        const productScreen = document.querySelector('.product-screen:not(.oe_hidden)');
        return productScreen && productScreen.offsetParent !== null;
    },

    /**
     * Handle keyboard input for quantity changes
     * @param {KeyboardEvent} event
     */
    handleKeyboardInput(event) {
        // CRITICAL FIX: Only work on ProductScreen (order screen), not payment page
        const productScreen = document.querySelector('.product-screen:not(.oe_hidden)');
        if (!productScreen || productScreen.offsetParent === null) {
            return;
        }

        // Only handle if this line is selected
        if (!this.props.line.selected) return;

        // Prevent if user is typing in an input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

        switch(event.key) {
            case 'ArrowUp':
            case '+':
                event.preventDefault();
                this.incrementQuantity();
                break;
            case 'ArrowDown':
            case '-':
                event.preventDefault();
                this.decrementQuantity();
                break;
            case 'Delete':
            case 'Backspace':
                event.preventDefault();
                this.deleteOrderLine();
                break;
        }
    },

    /**
     * Increment quantity by 1
     */
    incrementQuantity() {
        const order = this.pos.get_order();
        const line = order.get_selected_orderline();
        if (line && line === this.props.line) {
            const newQty = line.get_quantity() + 1;
            line.set_quantity(newQty);
        }
    },

    /**
     * Decrement quantity by 1 (minimum 0)
     */
    decrementQuantity() {
        const order = this.pos.get_order();
        const line = order.get_selected_orderline();
        if (line && line === this.props.line) {
            const newQty = Math.max(0, line.get_quantity() - 1);
            if (newQty === 0) {
                this.deleteOrderLine();
            } else {
                line.set_quantity(newQty);
            }
        }
    },

    /**
     * Delete the current order line
     */
    deleteOrderLine() {
        const order = this.pos.get_order();
        const line = order.get_selected_orderline();
        if (line && line === this.props.line) {
            order.removeOrderline(line);
        }
    }
});