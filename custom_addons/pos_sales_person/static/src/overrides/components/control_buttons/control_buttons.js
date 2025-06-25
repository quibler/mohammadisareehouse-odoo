/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { SalesPersonButton } from "@custom_pos/app/screens/product_screen/control_buttons/sales_person_button/sales_person_button";
import { AmountDiscountButton } from "@custom_pos/app/screens/product_screen/control_buttons/amount_discount_button/amount_discount_button";

patch(ControlButtons, {
    components: {
        ...ControlButtons.components,
        SalesPersonButton,
        AmountDiscountButton,
    },
});

patch(ControlButtons.prototype, {
    setup() {
        super.setup();
        this.pos = this.env.services.pos;
    },

    get showAmountDiscountButton() {
        return this.pos.config.enable_amount_discount &&
               (this.pos.config.global_discount_type === 'amount' ||
                this.pos.config.global_discount_type === 'both');
    }
});