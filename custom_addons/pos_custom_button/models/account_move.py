# -*- coding: utf-8 -*-
from odoo import models, fields

class AccountInvoice(models.Model):
    _inherit = "account.move"

    pos_sales_person_id = fields.Many2one("hr.employee", string="POS Sales person")