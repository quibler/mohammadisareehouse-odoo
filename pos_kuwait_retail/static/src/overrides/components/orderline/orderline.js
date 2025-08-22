/** @odoo-module */

import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";
import { patch } from "@web/core/utils/patch";

/**
 * Minimal Orderline Enhancement
 * Only handles line-specific quantity changes when line is selected
 */

patch(Orderline.prototype, {
    setup() {
        super.setup();
        document.addEventListener('keydown', this.handleLineKeys.bind(this));
    },

    handleLineKeys(event) {
        // Only for selected lines on Product Screen
        if (!this.props.line.selected ||
            !document.querySelector('.product-screen:not(.oe_hidden)')?.offsetParent ||
            event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' ||
            event.target.closest('.modal, .popup, .dialog, .dropdown-menu, .o_popover')) {
            return;
        }

        const currentQty = this.props.line.get_quantity();
        let handled = false;

        switch (event.key) {
            case 'ArrowUp':
            case '+':
                this.props.line.set_quantity(currentQty + 1);
                handled = true;
                break;
            case 'ArrowDown':
            case '-':
                const newQty = Math.max(0, currentQty - 1);
                if (newQty === 0) {
                    this.env.services.pos.get_order().removeOrderline(this.props.line);
                } else {
                    this.props.line.set_quantity(newQty);
                }
                handled = true;
                break;
            case 'Delete':
                this.env.services.pos.get_order().removeOrderline(this.props.line);
                handled = true;
                break;
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
});