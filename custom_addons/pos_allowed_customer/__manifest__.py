# See LICENSE file for full copyright and licensing details.
{
    "name": "POS Allowed Customer",
    "version": "18.0.1.0.0",
    "summary": "Only Allowed Customers will be loaded on the POS",
    "license": "Other proprietary",
    "author": "BizzAppDev Systems Pvt. Ltd.",
    "website": "http://www.bizzappdev.com",
    "depends": ["point_of_sale"],
    "data": ["views/res_partner_view.xml"],
    "assets": {
        "point_of_sale._assets_pos": [
            "pos_allowed_customer/static/src/*",
        ]
    },
    "installable": True,
}
