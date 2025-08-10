from odoo import models


class StockQuant(models.Model):
    _inherit = 'stock.quant'

    def action_view_inventory(self):
        """Override to remove the default 'My Count' filter for inventory users"""
        action = super().action_view_inventory()

        # Remove the default 'my_count' filter from context
        context = action.get('context', {})
        if 'search_default_my_count' in context:
            del context['search_default_my_count']
            action['context'] = context

        return action