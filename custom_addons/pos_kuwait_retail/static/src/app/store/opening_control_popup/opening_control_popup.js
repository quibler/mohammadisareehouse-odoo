/** @odoo-module **/

import { OpeningControlPopup } from "@point_of_sale/app/store/opening_control_popup/opening_control_popup";
import { patch } from "@web/core/utils/patch";

patch(OpeningControlPopup.prototype, {
    setup() {
        super.setup();
        // Override the opening cash to default to 0 instead of previous amount
        this.state.openingCash = this.env.utils.formatCurrency(0, false);
    }
});