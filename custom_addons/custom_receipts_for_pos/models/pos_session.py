# -*- coding: utf-8 -*-
################################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#
#    Copyright (C) 2025-TODAY Cybrosys Technologies(<https://www.cybrosys.com>).
#    Author: Sreerag PM (<https://www.cybrosys.com>)
#
#    This program is free software: you can modify
#    it under the terms of the GNU Affero General Public License (AGPL) as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
################################################################################
from odoo import models, api


class PosSession(models.Model):
    """
       This is an Odoo model for Point of Sale (POS) sessions.
       It inherits from the 'pos.session' model and extends its functionality.
       Updated for Odoo 18 POS data loading methods.
    """
    _inherit = 'pos.session'

    def _loader_params_product_product(self):
        """Function to load the product field to the product params"""
        result = super()._loader_params_product_product()
        result['search_params']['fields'].append('qty_available')
        return result

    @api.model
    def _load_pos_data_models(self, config_id):
        """Load pos.receipt model data for the POS interface"""
        data = super()._load_pos_data_models(config_id)
        # Add pos.receipt to the list of models to load
        if 'pos.receipt' not in data:
            data.append('pos.receipt')
        return data

    def _loader_params_pos_receipt(self):
        """Function that returns the loader params for pos.receipt model"""
        return {
            'search_params': {
                'fields': ['name', 'design_receipt'],
            },
        }

    def _get_pos_ui_pos_receipt(self, params):
        """Used to Return the pos receipt data to the POS UI"""
        return self.env['pos.receipt'].search_read(**params['search_params'])

    def _get_pos_ui_pos_config(self, params):
        """Add receipt design data to POS config"""
        result = super()._get_pos_ui_pos_config(params)
        config = self.config_id
        if config and hasattr(config, 'is_custom_receipt') and config.is_custom_receipt:
            if hasattr(config, 'receipt_design_id') and config.receipt_design_id:
                result.update({
                    'is_custom_receipt': config.is_custom_receipt,
                    'design_receipt': config.design_receipt or '',
                    'receipt_design_id': config.receipt_design_id.id,
                })
            else:
                result.update({
                    'is_custom_receipt': False,
                    'design_receipt': '',
                    'receipt_design_id': False,
                })
        else:
            result.update({
                'is_custom_receipt': False,
                'design_receipt': '',
                'receipt_design_id': False,
            })
        return result