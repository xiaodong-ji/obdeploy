import { changeParameterUnit } from '@/component/OCPPreCheck/helper';
import {
  CompDetailCheckInfo,
  CompNodeCheckInfo,
  DeployedCompCheckInfo,
  PathCheckInfo,
  UserCheckInfo,
} from '@/component/PreCheckComps';

import { DEFAULT_PROXY_PWD } from '@/constant';
import { getPublicKey } from '@/services/ob-deploy-web/Common';
import { createDeploymentConfig } from '@/services/ob-deploy-web/Deployments';
import { getErrorInfo, handleQuit } from '@/utils';
import { encryptPwdForConfig } from '@/utils/encrypt';
import { generateRandomPassword, isExist } from '@/utils/helper';
import { intl } from '@/utils/intl';
import useRequest from '@/utils/useRequest';
import { ProCard } from '@ant-design/pro-components';
import { Alert, Button, Col, Input, Row, Space, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect } from 'react';
import { getLocale, useModel } from 'umi';
import {
  allComponentsKeys,
  componentsConfig,
  componentVersionTypeToComponent,
  configServerComponent,
  configServerComponentKey,
  grafanaComponent,
  modeConfig,
  obagentComponent,
  obproxyComponent,
  oceanbaseComponent,
  oceanbaseStandaloneComponent,
  onlyComponentsKeys,
  prometheusComponent,
} from '../constants';
import EnStyles from './indexEn.less';
import ZhStyles from './indexZh.less';

const locale = getLocale();
const styles = locale === 'zh-CN' ? ZhStyles : EnStyles;
interface ComponentsNodeConfig {
  name: string;
  servers: string[];
  key: string;
  isTooltip: boolean;
}

export const formatConfigData = (
  configData: API.DeploymentConfig,
  scenarioParam: any,
  publicKey: string,
) => {
  const formatedConfigData = encryptPwdForConfig(configData, publicKey);
  let isOBConfig = false;
  const _configData = formatedConfigData.components || formatedConfigData;
  if (formatedConfigData.components) isOBConfig = true;
  Object.keys(_configData).forEach((key) => {
    if (typeof _configData[key] === 'object') {
      for (let i = 0; i < _configData[key]?.parameters.length; i++) {
        const parameter = _configData[key]?.parameters[i];
        // 筛选原则：修改过下拉框或者输入框的参数传给后端；自动分配、值为空的参数均不传给后端
        if (
          (!parameter.adaptive && !isExist(parameter.value)) ||
          parameter.adaptive ||
          !parameter.isChanged
        ) {
          _configData[key]?.parameters?.splice(i--, 1);
        }
        if (parameter.key === 'ocp_meta_tenant_memory_size') {
          parameter.value = changeParameterUnit(parameter).value;
        }
        delete parameter.isChanged;
      }
      if (key === configServerComponentKey) {
        _configData[key]?.parameters?.forEach((parameter) => {
          if (parameter.key === 'log_maxsize') {
            parameter.type = 'Integer';
            parameter.value = Number(parameter.value.split('MB')[0]);
          }
        });
      }
    }
  });
  if (scenarioParam) {
    _configData.oceanbase.parameters = [
      scenarioParam,
      ...(_configData.oceanbase.parameters || []),
    ];
  }
  if (isOBConfig) {
    return {
      ...formatedConfigData,
      components: _configData,
    };
  }
  return _configData;
};

export default function CheckInfo() {
  const {
    configData,
    setConfigData,
    setCheckOK,
    lowVersion,
    setCurrentStep,
    handleQuitProgress,
    setErrorVisible,
    setErrorsList,
    selectedConfig,
    errorsList,
    scenarioParam,
    loadTypeVisible,
  } = useModel('global');
  const { components = {}, auth, home_path } = configData || {};
  const {
    oceanbase = {},
    obproxy = {},
    obagent = {},
    obconfigserver = {},
    grafana = {},
    prometheus = {},
  } = components;

  const { run: handleCreateConfig, loading } = useRequest(
    createDeploymentConfig,
    {
      onSuccess: ({ success }: API.OBResponse) => {
        if (success) {
          setCheckOK(true);
        }
      },
      onError: (e: any) => {
        const errorInfo = getErrorInfo(e);
        setErrorVisible(true);
        setErrorsList([...errorsList, errorInfo]);
      },
    },
  );

  const prevStep = () => {
    setCurrentStep(3);
    window.scrollTo(0, 0);
  };

  const handlePreCheck = async () => {
    const { data: publicKey } = await getPublicKey();
    handleCreateConfig(
      { name: oceanbase?.appname },
      formatConfigData(configData, scenarioParam, publicKey),
    );
  };

  const getComponentsList = () => {
    const componentsList: API.TableComponentInfo[] = [];
    allComponentsKeys.forEach((key) => {
      if (components?.[key]) {
        const componentConfig = componentsConfig?.[key] || {};
        componentsList.push({
          ...componentConfig,
          version: components?.[key].version,
          key,
        });
      }
    });
    return componentsList;
  };

  const getComponentsNodeConfigList = () => {
    const componentsNodeConfigList: ComponentsNodeConfig[] = [];
    const tempSelectedConfig = selectedConfig.map(
      (item) => componentVersionTypeToComponent[item] || item,
    );

    let currentOnlyComponentsKeys = onlyComponentsKeys.filter(
      (key) => key !== 'obagent' && tempSelectedConfig.includes(key),
    );

    currentOnlyComponentsKeys.forEach((key) => {
      if (key !== 'ocpexpress' && componentsConfig?.[key]) {
        componentsNodeConfigList.push({
          key,
          name: componentsConfig?.[key]?.name,
          servers: components?.[key]?.servers?.join('，'),
          isTooltip: key === obproxyComponent,
        });
      }
    });
    return componentsNodeConfigList;
  };

  // 当前 OB 环境是否为单机版
  const standAlone = oceanbase?.component === 'oceanbase-standalone';
  const dbConfigColumns: ColumnsType<API.DBConfig> = [
    {
      title: intl.formatMessage({
        id: 'OBD.pages.components.CheckInfo.ZoneName',
        defaultMessage: 'Zone 名称',
      }),
      dataIndex: 'name',
      width: 200,
      render: (text) => text || '-',
    },
    {
      title: intl.formatMessage({
        id: 'OBD.pages.components.CheckInfo.ObServerNodes',
        defaultMessage: 'OB Server 节点',
      }),
      dataIndex: 'servers',
      render: (text) => {
        const serversIps = text.map((item: API.OceanbaseServers) => item.ip);
        const str = serversIps.join('，');
        return (
          <Tooltip title={str} placement="topLeft">
            <div className="ellipsis">{str}</div>
          </Tooltip>
        );
      },
    },
    ...(!standAlone
      ? [
          {
            title: intl.formatMessage({
              id: 'OBD.pages.components.CheckInfo.RootServerNodes',
              defaultMessage: 'Root Server 节点',
            }),
            dataIndex: 'rootservice',
            width: 200,
            render: (text) => text || '-',
          },
        ]
      : []),
  ];

  const componentsList = getComponentsList();
  const componentsNodeConfigList = getComponentsNodeConfigList();
  const initDir = `${home_path}/oceanbase/store`;
  const clusterConfigInfo = [
    {
      key: 'cluster',
      group: intl.formatMessage({
        id: 'OBD.pages.components.CheckInfo.ClusterConfiguration',
        defaultMessage: '集群配置',
      }),
      content: [
        {
          label: intl.formatMessage({
            id: 'OBD.pages.components.CheckInfo.ConfigurationMode',
            defaultMessage: '配置模式',
          }),
          colSpan: 5,
          value: modeConfig[oceanbase?.mode],
        },
        {
          label: intl.formatMessage({
            id: 'OBD.pages.components.CheckInfo.RootSysPassword',
            defaultMessage: 'root@sys 密码',
          }),
          colSpan: 5,
          value: (
            <Tooltip title={oceanbase?.root_password} placement="topLeft">
              <Input.Password
                value={oceanbase?.root_password}
                visibilityToggle={true}
                readOnly
                bordered={false}
                style={{ padding: 0 }}
              />
            </Tooltip>
          ),
        },
        {
          label: intl.formatMessage({
            id: 'OBD.pages.components.CheckInfo.DataDirectory',
            defaultMessage: '数据目录',
          }),
          value: (
            <Tooltip title={oceanbase?.data_dir || initDir} placement="topLeft">
              <div className="ellipsis">{oceanbase?.data_dir || initDir}</div>
            </Tooltip>
          ),
        },
        {
          label: intl.formatMessage({
            id: 'OBD.pages.components.CheckInfo.LogDirectory',
            defaultMessage: '日志目录',
          }),
          value: (
            <Tooltip title={oceanbase?.redo_dir || initDir} placement="topLeft">
              <div className="ellipsis">{oceanbase?.redo_dir || initDir}</div>
            </Tooltip>
          ),
        },
        {
          label: intl.formatMessage({
            id: 'OBD.pages.components.CheckInfo.SqlPort',
            defaultMessage: 'SQL 端口',
          }),
          colSpan: 3,
          value: oceanbase?.mysql_port,
        },
        {
          label: intl.formatMessage({
            id: 'OBD.pages.components.CheckInfo.RpcPort',
            defaultMessage: 'RPC 端口',
          }),
          colSpan: 3,
          value: oceanbase?.rpc_port,
        },
        {
          label: 'OBShell 端口',
          colSpan: 3,
          value: oceanbase?.obshell_port,
        },
      ],

      more: oceanbase?.parameters?.length
        ? [
            {
              label:
                componentsConfig[oceanbaseComponent].labelName ||
                componentsConfig[oceanbaseStandaloneComponent].labelName,
              parameters: oceanbase?.parameters,
            },
          ]
        : [],
    },
  ];

  if (selectedConfig.length) {
    let content: any[] = [],
      more: any = [];
    if (selectedConfig.includes(obproxyComponent)) {
      content = content.concat(
        {
          label: intl.formatMessage({
            id: 'OBD.pages.Obdeploy.CheckInfo.PortObproxySql',
            defaultMessage: 'OBProxy SQL端口',
          }),
          value: obproxy?.listen_port,
        },
        {
          label: intl.formatMessage({
            id: 'OBD.pages.components.CheckInfo.PortObproxyExporter',
            defaultMessage: 'OBProxy Exporter 端口',
          }),
          value: obproxy?.prometheus_listen_port,
        },
        {
          label: intl.formatMessage({
            id: 'OBD.pages.Obdeploy.CheckInfo.PortObproxyRpc',
            defaultMessage: 'OBProxy RPC 端口',
          }),
          value: obproxy?.rpc_listen_port,
        },
      );
      obproxy?.parameters?.length &&
        more.push({
          label: componentsConfig[obproxyComponent].labelName,
          parameters: obproxy?.parameters,
        });
    }
    if (selectedConfig.includes(grafanaComponent)) {
      content = content.concat({
        label: 'Grafana 服务端口',
        value: grafana?.port,
      });
      grafana?.parameters?.length &&
        more.push({
          label: componentsConfig[grafanaComponent].labelName,
          parameters: grafana?.parameters,
        });
    }
    if (selectedConfig.includes(prometheusComponent)) {
      content = content.concat({
        label: 'Prometheus 服务端口',
        value: prometheus?.port,
      });
      prometheus?.parameters?.length &&
        more.push({
          label: componentsConfig[prometheusComponent].labelName,
          parameters: prometheus?.parameters,
        });
    }

    if (selectedConfig.includes(obagentComponent)) {
      content = content.concat(
        {
          label: intl.formatMessage({
            id: 'OBD.pages.components.CheckInfo.ObagentMonitoringServicePort',
            defaultMessage: 'OBAgent 监控服务端口',
          }),
          value: obagent?.monagent_http_port,
        },
        {
          label: intl.formatMessage({
            id: 'OBD.pages.components.CheckInfo.ObagentManageServicePorts',
            defaultMessage: 'OBAgent 管理服务端口',
          }),
          value: obagent?.mgragent_http_port,
        },
      );
      obagent?.parameters?.length &&
        more.push({
          label: componentsConfig[obagentComponent].labelName,
          parameters: obagent?.parameters,
        });
    }

    if (selectedConfig.includes(configServerComponent)) {
      content = content.concat({
        label: intl.formatMessage({
          id: 'OBD.pages.Obdeploy.CheckInfo.ObconfigserverServicePort',
          defaultMessage: 'OBConfigserver 服务端口',
        }),
        value: obconfigserver?.listen_port,
      });
      obconfigserver?.parameters?.length &&
        more.push({
          label: componentsConfig[configServerComponentKey].labelName,
          parameters: obconfigserver?.parameters,
        });
    }
    clusterConfigInfo.push({
      key: 'components',
      group: intl.formatMessage({
        id: 'OBD.pages.components.CheckInfo.ComponentConfiguration',
        defaultMessage: '组件配置',
      }),
      content,
      more,
    });

    clusterConfigInfo.map((item) => {
      if (item.key === 'cluster') {
        if (selectedConfig.includes(prometheusComponent)) {
          const prometheusPasswordItem = {
            label: intl.formatMessage({
              id: 'OBD.pages.components.CheckInfo.PrometheusPassword',
              defaultMessage: 'Prometheus 密码',
            }),
            colSpan: 5,
            value: (
              <Tooltip
                title={prometheus?.basic_auth_users?.admin}
                placement="topLeft"
              >
                <Input.Password
                  value={prometheus?.basic_auth_users?.admin}
                  visibilityToggle={true}
                  readOnly
                  bordered={false}
                  style={{ padding: 0 }}
                />
              </Tooltip>
            ),
          };
          item.content.splice(2, 0, prometheusPasswordItem);
        }
        if (selectedConfig.includes(grafanaComponent)) {
          const grafanaPasswordItem = {
            label: intl.formatMessage({
              id: 'OBD.pages.components.CheckInfo.GrafanaPassword',
              defaultMessage: 'Grafana 密码',
            }),
            colSpan: 5,
            value: (
              <Tooltip title={grafana?.login_password} placement="topLeft">
                <Input.Password
                  value={grafana?.login_password}
                  visibilityToggle={true}
                  readOnly
                  bordered={false}
                  style={{ padding: 0 }}
                />
              </Tooltip>
            ),
          };
          item.content.splice(2, 0, grafanaPasswordItem);
        }
      }
    });
  }

  useEffect(() => {
    const { obproxy = {} } = configData.components;
    if (obproxy?.parameters) {
      // 如果没有密码，前端来随机生成一个
      const targetParam = obproxy?.parameters?.find(
        (item) => item.key === 'obproxy_sys_password',
      );
      if (!targetParam || !targetParam.value) {
        if (!targetParam) {
          const temp = { ...DEFAULT_PROXY_PWD };
          temp.value = generateRandomPassword('ob');
          obproxy?.parameters.push(temp);
        } else {
          obproxy?.parameters?.forEach((item) => {
            if (item.key === 'obproxy_sys_password') {
              item.value = generateRandomPassword('ob');
              item.adaptive = false;
              item.isChanged = true;
            }
          });
        }
        setConfigData({
          ...configData,
          components: {
            ...configData.components,
            obproxy,
          },
        });
      }
    }
  }, []);

  return (
    <Space
      className={`${styles.spaceWidth} ${styles.checkInfoSpace}`}
      direction="vertical"
      size="middle"
    >
      <Alert
        message={intl.formatMessage({
          id: 'OBD.pages.components.CheckInfo.OceanbaseTheInstallationInformationConfiguration',
          defaultMessage:
            'OceanBase 安装信息配置已完成，请检查并确认以下配置信息，确定后开始预检查。',
        })}
        type="info"
        showIcon
      />

      <ProCard className={styles.pageCard} split="horizontal">
        <Row gutter={16}>
          <ProCard
            title={intl.formatMessage({
              id: 'OBD.pages.components.CheckInfo.DeploymentConfiguration',
              defaultMessage: '部署配置',
            })}
            className="card-padding-bottom-24"
          >
            <Col span={12}>
              <ProCard className={styles.infoSubCard} split="vertical">
                <ProCard
                  colSpan={10}
                  title={intl.formatMessage({
                    id: 'OBD.pages.components.CheckInfo.DeploymentClusterName',
                    defaultMessage: '部署集群名称',
                  })}
                >
                  {oceanbase?.appname}
                </ProCard>
                {loadTypeVisible ? (
                  <ProCard
                    colSpan={10}
                    title={intl.formatMessage({
                      id: 'OBD.pages.Obdeploy.CheckInfo.LoadType',
                      defaultMessage: '负载类型',
                    })}
                  >
                    {scenarioParam?.value}
                  </ProCard>
                ) : null}
              </ProCard>
            </Col>
          </ProCard>
          {/* 部署组件配置 */}
          <DeployedCompCheckInfo
            className="card-header-padding-top-0"
            componentsList={componentsList}
          />
        </Row>
      </ProCard>
      <ProCard className={styles.pageCard} split="horizontal">
        <Row gutter={16}>
          <ProCard
            title={intl.formatMessage({
              id: 'OBD.pages.components.CheckInfo.DatabaseNodeConfiguration',
              defaultMessage: '数据库节点配置',
            })}
            className="card-padding-bottom-24"
          >
            <ProCard
              className={styles.infoSubCard}
              style={{ border: '1px solid #e2e8f3' }}
              split="vertical"
            >
              <Table
                className={`${styles.infoCheckTable}  ob-table`}
                columns={dbConfigColumns}
                dataSource={oceanbase?.topology}
                rowKey="id"
                scroll={{ y: 300 }}
                pagination={false}
              />
            </ProCard>
          </ProCard>
          {/* 组件节点配置 */}
          {selectedConfig.length ? (
            <CompNodeCheckInfo
              className="card-header-padding-top-0"
              componentsNodeConfigList={componentsNodeConfigList}
            />
          ) : null}
          {/* 部署用户配置 */}
          <UserCheckInfo
            title={intl.formatMessage({
              id: 'OBD.pages.components.CheckInfo.DeployUserConfiguration',
              defaultMessage: '部署用户配置',
            })}
            className="card-header-padding-top-0"
            user={auth?.user}
            password={auth?.password}
          />
          {/* 软件路径配置 */}
          <PathCheckInfo
            className="card-header-padding-top-0"
            home_path={home_path}
          />
        </Row>
      </ProCard>
      <CompDetailCheckInfo
        className="card-header-padding-top-0"
        clusterConfigInfo={clusterConfigInfo}
      />
      <footer className={styles.pageFooterContainer}>
        <div className={styles.pageFooter}>
          <Space className={styles.foolterAction}>
            <Button
              onClick={() => handleQuit(handleQuitProgress, setCurrentStep)}
              data-aspm-click="c307504.d317275"
              data-aspm-desc={intl.formatMessage({
                id: 'OBD.pages.components.CheckInfo.PreCheckExit',
                defaultMessage: '预检查-退出',
              })}
              data-aspm-param={``}
              data-aspm-expo
            >
              {intl.formatMessage({
                id: 'OBD.pages.components.CheckInfo.Exit',
                defaultMessage: '退出',
              })}
            </Button>
            <Button
              onClick={prevStep}
              data-aspm-click="c307504.d317274"
              data-aspm-desc={intl.formatMessage({
                id: 'OBD.pages.components.CheckInfo.PreCheckPreviousStep',
                defaultMessage: '预检查-上一步',
              })}
              data-aspm-param={``}
              data-aspm-expo
            >
              {intl.formatMessage({
                id: 'OBD.pages.components.CheckInfo.PreviousStep',
                defaultMessage: '上一步',
              })}
            </Button>
            <Button
              type="primary"
              onClick={handlePreCheck}
              loading={loading}
              data-aspm-click="c307504.d317273"
              data-aspm-desc={intl.formatMessage({
                id: 'OBD.pages.components.CheckInfo.PreCheck',
                defaultMessage: '预检查-预检查',
              })}
              data-aspm-param={``}
              data-aspm-expo
            >
              {intl.formatMessage({
                id: 'OBD.pages.components.CheckInfo.PreCheck.1',
                defaultMessage: '预检查',
              })}
            </Button>
          </Space>
        </div>
      </footer>
    </Space>
  );
}
