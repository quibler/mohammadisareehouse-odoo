/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { SalesPersonButton } from "./sales_person_button/sales_person_button";

patch(ControlButtons, {
    components: {
        ...ControlButtons.components,
        SalesPersonButton,
    },
    setup() {
        super.setup();
        console.log("ControlButtons setup called");
        console.log("Registered components:", this.components); // 'this' refers to the ControlButtons instance
    },
});