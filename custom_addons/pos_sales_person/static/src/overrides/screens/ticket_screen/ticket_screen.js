/** @odoo-module **/

import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { patch } from "@web/core/utils/patch";

patch(TicketScreen.prototype, {
    async addAdditionalRefundInfo(order, destinationOrder) {
        console.log('addAdditionalRefundInfo called');
        console.log('Original order:', order);
        console.log('Original order sales_person_id:', order.sales_person_id);
        console.log('Destination order before:', destinationOrder);
        console.log('Destination order sales person before:', destinationOrder.getSalesPerson());

        // Call the parent method first
        await super.addAdditionalRefundInfo(order, destinationOrder);

        // Inherit sales person from original order to refund order
        if (order.sales_person_id && !destinationOrder.getSalesPerson()) {
            console.log('Setting sales person on refund order:', order.sales_person_id);
            destinationOrder.setSalesPerson(order.sales_person_id);
            console.log('Sales person set successfully');
        } else {
            console.log('Not setting sales person:', {
                originalHasSalesPerson: !!order.sales_person_id,
                destinationAlreadyHasSalesPerson: !!destinationOrder.getSalesPerson()
            });
        }

        console.log('Destination order after:', destinationOrder);
        console.log('Destination order sales person after:', destinationOrder.getSalesPerson());
    },
});