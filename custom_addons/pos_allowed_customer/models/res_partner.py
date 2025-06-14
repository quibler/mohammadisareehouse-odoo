from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    # New field. #T6480
    available_in_pos = fields.Boolean(string="Available in POS", copy=False)

    @api.model
    def _load_pos_data_fields(self, config_id):
        """#T8412:  Add 'available_in_pos' to the list of fields"""
        fields = super()._load_pos_data_fields(config_id)
        fields.append("available_in_pos")
        return fields

    @api.model
    def _load_pos_data_domain(self, data):
        """
        #T8412: Add domain available_in_pos in existing domain
        """
        domain = super()._load_pos_data_domain(data)
        domain.append(("available_in_pos", "=", True))
        return domain
