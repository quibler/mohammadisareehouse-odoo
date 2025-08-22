/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

// Patch the PaymentScreen to customize cash buttons from +10, +20, +50 to +5, +10, +20
patch(PaymentScreen.prototype, {
    getNumpadButtons() {
        const originalButtons = super.getNumpadButtons();

        // Replace the cash amount buttons with Kuwait-friendly denominations
        return originalButtons.map(button => {
            if (button.value === "+10") {
                return {
                    ...button,
                    value: "+5",
                    text: "+5"
                };
            } else if (button.value === "+20") {
                return {
                    ...button,
                    value: "+10",
                    text: "+10"
                };
            } else if (button.value === "+50") {
                return {
                    ...button,
                    value: "+20",
                    text: "+20"
                };
            }
            return button;
        });
    }
});