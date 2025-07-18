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


def reload(plugin_context, new_cluster_config, *args, **kwargs):
    stdio = plugin_context.stdio
    cluster_config = plugin_context.cluster_config
    servers = cluster_config.servers
    cursor = plugin_context.get_return('connect').get_return('cursor')
    cluster_server = {}
    change_conf = {}
    global_change_conf = {}
    global_ret = True
    need_restart_key = []

    config_map = {
        'observer_sys_password': 'proxyro_password',
        'cluster_name': 'appname',
        'observer_root_password': 'root_password'
    }
    for comp in ['oceanbase', 'oceanbase-ce']:
        if comp in cluster_config.depends:
            root_servers = {}
            ob_config = cluster_config.get_depend_config(comp)
            new_ob_config = new_cluster_config.get_depend_config(comp)
            ob_config = {} if ob_config is None else ob_config
            new_ob_config = {} if new_ob_config is None else new_ob_config
            for key in config_map:
                if ob_config.get(key) != new_ob_config.get(key):
                    global_change_conf[config_map[key]] = new_ob_config.get(key)

    for server in servers:
        change_conf[server] = {}
        stdio.verbose('get %s old configuration' % (server))
        config = cluster_config.get_server_conf_with_default(server)
        stdio.verbose('get %s new configuration' % (server))
        new_config = new_cluster_config.get_server_conf_with_default(server)
        stdio.verbose('get %s cluster address' % (server))
        cluster_server[server] = '%s:%s' % (server.ip, config['listen_port'])
        stdio.verbose('compare configuration of %s' % (server))
        reload_unused = ['observer_root_password']
        for key in new_config:
            if key in reload_unused:
                continue
            if key not in config or config[key] != new_config[key]:
                item = cluster_config.get_temp_conf_item(key)
                if item:
                    if item.need_restart:
                        need_restart_key.append(key)
                        stdio.verbose('%s can not be reload' % key)
                        if not plugin_context.get_return("restart_pre"):
                            global_ret = False
                            continue
                    elif item.need_redeploy:
                        stdio.verbose('%s can not be reload' % key)
                        global_ret = False
                        continue
                    try:
                        item.modify_limit(config.get(key), new_config.get(key))
                    except Exception as e:
                        stdio.verbose('%s: %s' % (server, str(e)))
                        global_ret = False
                        continue
                change_conf[server][key] = new_config[key]
                if key not in global_change_conf:
                    global_change_conf[key] = 1
                else:
                    global_change_conf[key] += 1
                    
    servers_num = len(servers)
    stdio.verbose('apply new configuration')
    stdio.start_load('Reload obproxy')
    success_conf = {}
    sql = ''
    value = None
    for key in global_change_conf:
        if key in set(need_restart_key):
            continue
        success_conf[key] = []
        for server in servers:
            if key not in change_conf[server]:
                continue
            sql = 'alter proxyconfig set %s = %%s' % key
            value = change_conf[server][key] if change_conf[server].get(key) is not None else ''
            if cursor[server].execute(sql, [value]) is False:
                global_ret = False
                continue
            success_conf[key].append(server)
    for key in success_conf:
        if global_change_conf[key] == servers_num == len(success_conf):
            cluster_config.update_global_conf(key, value, False)
        for server in success_conf[key]:
            value = change_conf[server][key]
            cluster_config.update_server_conf(server,key, value, False)
            
    if global_ret:
        stdio.stop_load('succeed')
        return plugin_context.return_true()
    else:
        stdio.stop_load('fail')
        return
