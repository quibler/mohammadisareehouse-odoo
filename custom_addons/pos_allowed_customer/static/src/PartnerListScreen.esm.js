/** @odoo-module **/

import {PartnerList} from "@point_of_sale/app/screens/partner_list/partner_list";
import {patch} from "@web/core/utils/patch";

patch(PartnerList.prototype, {
    /**
     * Override method to get only allowed partners on the Partner list screen
     * when searching the partner. #T6480
     * @override
     */
    async getNewPartners() {
        let domain = [];
        const limit = 30;
        if (this.state.query) {
            const search_fields = [
                "name",
                "parent_name",
                "phone_mobile_search",
                "email",
                "barcode",
            ];
            domain = [
                "&",
                ...Array(search_fields.length - 1).fill("|"),
                ...search_fields.map((field) => [
                    field,
                    "ilike",
                    this.state.query + "%",
                ]),
                // BAD customisation Start
                // Added a condition for the available_in_pos.
                ["available_in_pos", "=", true],
                // BAD customisation End
            ];
        }
        const result = await this.pos.data.searchRead("res.partner", domain, [], {
            limit: limit,
            offset: this.state.currentOffset,
        });
        return result;
    },
    // #T8412: Inherit method to get allowed pos partners
    getPartners() {
        const availablePartners = super.getPartners();
        const allowedPartners = availablePartners.filter(
            (partner) => partner.available_in_pos
        );
        return allowedPartners;
    },
});
