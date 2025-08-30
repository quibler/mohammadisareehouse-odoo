# -*- coding: utf-8 -*-
from odoo import models, fields


class ProductCategory(models.Model):
    _inherit = 'product.category'

    # Cost update strategy for vendor bill processing
    # This field is kept for future extensibility but not currently exposed in the UI
    # 
    # Future developers can:
    # 1. Add views/product_category_views.xml to expose this field in the UI
    # 2. Modify the cost update logic in account_move.py to use different strategies
    # 3. Add additional strategy options as needed
    # 
    # Currently, cost updates always happen for all products regardless of category settings
    # The strategy defaults to 'always' but can be changed programmatically if needed
    cost_update_strategy = fields.Selection([
        ('always', 'Always Update to Bill Price'),
        ('if_higher', 'Only if Bill Price is Higher'),
        ('if_lower', 'Only if Bill Price is Lower'),
        ('weighted_average', 'Calculate Weighted Average'),
    ], string='Cost Update Strategy', default='always')

    # Future extension possibilities:
    # - Add cost_update_enabled boolean field to toggle per-category
    # - Add minimum_cost_threshold float field for threshold-based updates
    # - Add cost_update_journal_id many2one for specific accounting treatment
    # - Add cost_update_notification boolean for alerting on cost changes