# -*- coding: utf-8 -*-
from odoo import models, fields, api

class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config_id):
        data = super()._load_pos_data_models(config_id)
        config_id = self.env['pos.config'].browse(config_id)
        if not config_id.module_pos_hr:
            data += ['hr.employee']
        return data