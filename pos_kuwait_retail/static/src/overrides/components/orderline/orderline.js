/** @odoo-module */

import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";
import { patch } from "@web/core/utils/patch";

/**
 * Enhanced Order Line with Quick Quantity Controls
 * Adds +/- buttons and keyboard support for fast quantity changes
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
     * Handle keyboard input for quantity changes
     * @param {KeyboardEvent} event
     */
    handleKeyboardInput(event) {
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
            const currentQty = line.get_quantity();
            if (currentQty > 1) {
                line.set_quantity(currentQty - 1);
            } else {
                // If quantity would go to 0, delete the line
                this.deleteOrderLine();
            }
        }
    },

    /**
     * Delete the order line
     */
    deleteOrderLine() {
        const order = this.pos.get_order();
        const line = order.get_selected_orderline();
        if (line && line === this.props.line) {
            order.remove_orderline(line);
        }
    },

    /**
     * Quick set quantity to specific number
     * @param {number} qty
     */
    setQuickQuantity(qty) {
        const order = this.pos.get_order();
        const line = order.get_selected_orderline();
        if (line && line === this.props.line) {
            if (qty === 0) {
                this.deleteOrderLine();
            } else {
                line.set_quantity(qty);
            }
        }
    }
});