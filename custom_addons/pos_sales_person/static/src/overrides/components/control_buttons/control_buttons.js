import {patch} from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { SalesPersonButton } from "@pos_custom_button/app/screens/product_screen/control_buttons/sales_person_button/sales_person_button";

console.log("!!!!!!!", SalesPersonButton)
patch(ControlButtons, {
    components: {
        ...ControlButtons.components,
        SalesPersonButton,
    },
});
