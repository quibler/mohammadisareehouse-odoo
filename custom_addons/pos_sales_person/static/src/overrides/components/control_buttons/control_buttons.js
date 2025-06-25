/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { SalesPersonButton } from "@pos_sales_person/app/screens/product_screen/control_buttons/sales_person_button/sales_person_button";
import { DiscountButton } from "@pos_sales_person/app/screens/product_screen/control_buttons/discount_button/discount_button";

patch(ControlButtons, {
    components: {
        ...ControlButtons.components,
        SalesPersonButton,
        DiscountButton,
    },
});