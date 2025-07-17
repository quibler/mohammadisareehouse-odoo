from odoo import models, fields


class ProductCategory(models.Model):
    _inherit = 'product.category'

    auto_update_cost_from_bill = fields.Boolean(
        string='Auto Update Cost from Vendor Bills',
        default=True,
        help="If enabled, product costs will be automatically updated "
             "when vendor bills are posted for products in this category."
    )

    cost_update_strategy = fields.Selection([
        ('always', 'Always Update to Bill Price'),
        ('if_higher', 'Only if Bill Price is Higher'),
        ('if_lower', 'Only if Bill Price is Lower'),
        ('weighted_average', 'Calculate Weighted Average'),
    ], string='Cost Update Strategy', default='always',
        help="Strategy to use when updating product costs from vendor bills:\n"
             "- Always Update: Replace current cost with bill price\n"
             "- Only if Higher: Update only when bill price > current cost\n"
             "- Only if Lower: Update only when bill price < current cost\n"
             "- Weighted Average: Calculate average with existing stock")
