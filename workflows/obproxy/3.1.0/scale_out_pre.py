# coding: utf-8
# Copyright (c) 2025 OceanBase.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from __future__ import absolute_import, division, print_function

import const


def scale_out_pre(plugin_context, workflow, ob_repository, *args, **kwargs):
    cluster_config = plugin_context.cluster_config
    added_servers = cluster_config.added_servers
    workflow.add_with_component_version_kwargs(const.STAGE_FIRST,
                                               ob_repository.name,
                                               '4.0.0.0', {'scale_out_component': plugin_context.cluster_config.name},
                                               'connect')
    workflow.add_with_kwargs(const.STAGE_SECOND, {'target_servers': added_servers}, 'init')

    plugin_context.return_true()
