/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    orderExportForPrinting(order) {
        const result = super.orderExportForPrinting(order);
        // Add POS config name to the receipt data
        result.pos_config_name = this.config.name;
        return result;
    },

    // NEW: Skip opening control functionality
    /**
     * Override to skip opening control popup entirely
     * This will automatically set the session to 'opened' state
     * without showing the opening control popup
     */
    shouldShowOpeningControl() {
        // Always return false to skip opening control
        return false;
    },

    /**
     * Override to handle session state transition automatically
     * when opening control would normally be shown
     */
    async ready() {
        // If session is in opening_control state, automatically transition to opened
        if (this.session.state === "opening_control") {
            await this.autoOpenSession();
        }
        return super.ready();
    },

    /**
     * Automatically open the session without user interaction
     * Sets opening cash to 0 and no notes
     */
    async autoOpenSession() {
        try {
            await this.data.call(
                "pos.session",
                "set_opening_control",
                [this.session.id, 0, ""], // 0 opening cash, empty notes
                {},
                true
            );
            this.session.state = "opened";
        } catch (error) {
            console.error("Failed to auto-open session:", error);
            // Fallback to showing login screen if auto-open fails
            this.showLoginScreen();
        }
    }
});