/** @odoo-module */

import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { patch } from "@web/core/utils/patch";
import { onMounted, useEffect } from "@odoo/owl";

/**
 * Force Price Focus in ActionPad
 * Override any default qty focus behavior
 */

patch(ActionpadWidget.prototype, {

    setup() {
        super.setup();

        // Force price mode immediately
        this._setPriceMode();

        // Use onMounted to force again when DOM is ready
        onMounted(() => {
            this._setPriceMode();
            setTimeout(() => this._setPriceMode(), 10);
            setTimeout(() => this._setPriceMode(), 50);
            setTimeout(() => this._setPriceMode(), 100);
        });

        // Watch for any mode changes and override them
        useEffect(() => {
            if (this.pos && this.pos.config && this.pos.user &&
                this.pos.cashierHasPriceControlRights() &&
                this.pos.numpadMode !== "price") {
                setTimeout(() => this._setPriceMode(), 0);
            }
        }, () => [this.pos.numpadMode]);
    },

    /**
     * Override any mode change that tries to set qty as default
     */
    mounted() {
        if (super.mounted) {
            super.mounted();
        }

        // Force price mode after mounting
        this._setPriceMode();
        setTimeout(() => this._setPriceMode(), 0);
    },

    /**
     * Set price mode and force visual update
     * @private
     */
    _setPriceMode() {
        // Safety check: only proceed if POS is ready
        if (this.pos && this.pos.config && this.pos.user && this.pos.cashierHasPriceControlRights()) {
            this.pos.numpadMode = "price";

            // Force re-render to update button states
            if (this.render && typeof this.render === 'function') {
                try {
                    this.render();
                } catch (e) {
                    // Ignore render errors
                }
            }
        }
    }
});