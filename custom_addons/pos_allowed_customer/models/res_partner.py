from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    @api.model
    def _load_pos_data_domain(self, data):
        """
        Modified to use customer_rank > 0 instead of available_in_pos field
        Only load partners that are marked as customers (customer_rank > 0)
        """
        domain = super()._load_pos_data_domain(data)
        # Replace the available_in_pos domain with customer_rank check
        domain.append(("customer_rank", ">", 0))
        return domain