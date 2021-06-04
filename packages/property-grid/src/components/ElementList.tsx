/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { IModelConnection } from "@bentley/imodeljs-frontend";
import { InstanceKey } from "@bentley/presentation-common";
import { PresentationLabelsProvider } from "@bentley/presentation-components";
import {
  PropertyDescription,
  PropertyEditorInfo,
  PropertyRecord,
  PropertyValue,
  PropertyValueFormat,
} from "@bentley/ui-abstract";
import {
  ColumnDescription,
  RowItem,
  SelectionMode,
  SimpleTableDataProvider,
  Table,
} from "@bentley/ui-components";
import { Icon } from "@bentley/ui-core";
import classnames from "classnames";
import * as React from "react";
import { PropertyGridManager } from "../PropertyGridManager";
import "./ElementList.scss";

export interface ElementListProps {
  iModelConnection: IModelConnection;
  instanceKeys: InstanceKey[];
  onBack: () => void;
  onSelect: (instanceKey: InstanceKey) => void;
  rootClassName?: string;
}

interface ElementListState {
  dataProvider?: SimpleTableDataProvider;
}

/** Create simple property record */
const createPropertyRecord = (
  name: string,
  displayLabel: string,
  value: number | string,
  displayValue: string,
  editor?: PropertyEditorInfo,
  description?: PropertyDescription,
): PropertyRecord => {
  const propValue: PropertyValue = {
    valueFormat: PropertyValueFormat.Primitive,
    displayValue,
    value,
  };
  const propDescription: PropertyDescription = description ?? {
    displayLabel,
    name,
    typename: "string",
  };
  if (editor) {
    propDescription.editor = editor;
  }

  const record = new PropertyRecord(propValue, propDescription);
  record.isDisabled = false;
  record.isReadonly = editor === undefined;
  return record;
};

/** Map element ids and requests labels */
const instanceKeysToRowItems = (
  instanceKeys: InstanceKey[],
  labels: string[],
) => {
  const rows = new Array<RowItem>();
  for (let i = 0; i < instanceKeys.length; ++i) {
    const instanceKey = instanceKeys[i];
    const label = labels[i];
    const row: RowItem = { key: instanceKey.id, cells: [] };
    row.cells.push({
      key: "srl-result",
      record: createPropertyRecord("srl-result", label, label, label),
    });
    row.extendedData = {
      key: instanceKey,
    };
    rows.push(row);
  }
  return rows;
};

/** Gets labels from presentation layer, chunks up requests if necessary */
const getLabels = async (
  labelsProvider: PresentationLabelsProvider,
  instanceKeys: InstanceKey[],
): Promise<string[]> => {
  const chunkSize = 1000;
  if (instanceKeys.length < chunkSize) {
    return labelsProvider.getLabels(instanceKeys);
  } else {
    const labels: string[] = [];
    for (let i = 0; i < instanceKeys.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, instanceKeys.length);
      const chunk = instanceKeys.slice(i, end);
      const currentLabels = await labelsProvider.getLabels(chunk);
      labels.push(...currentLabels);
    }
    return labels;
  }
};

/** Creates a data provider with the labels */
const createDataProvider = async (
  labelsProvider: PresentationLabelsProvider,
  instanceKeys: InstanceKey[],
) => {
  const columns: ColumnDescription[] = [
    {
      key: "srl-result",
      label: "",
    },
  ];
  const labels = await getLabels(labelsProvider, instanceKeys);
  const rows = instanceKeysToRowItems(instanceKeys, labels);
  const dataProvider = new SimpleTableDataProvider(columns);
  dataProvider.setItems(rows);
  return dataProvider;
};

/** Shows a list of elements to inspect properties for */
export class ElementList extends React.Component<
  ElementListProps,
  ElementListState
  > {
  private _labelsProvider: PresentationLabelsProvider;
  private _unmounted: boolean = false;

  constructor(props: ElementListProps) {
    super(props);

    this._labelsProvider = new PresentationLabelsProvider({
      imodel: this.props.iModelConnection,
    });

    this.state = {};
  }

  public async componentDidMount() {
    const dataProvider = await createDataProvider(
      this._labelsProvider,
      this.props.instanceKeys,
    );

    if (!this._unmounted) {
      this.setState({ dataProvider });
    }
  }

  public componentWillUnmount() {
    this._unmounted = true;
  }

  /** On element selected in table, call the onSelect prop */
  private _onRowsSelected = async (
    rowIterator: AsyncIterableIterator<RowItem>,
    _replace: boolean,
  ) => {
    for await (const row of rowIterator) {
      if (
        row.extendedData !== undefined &&
        row.extendedData.key !== undefined
      ) {
        this.props.onSelect(row.extendedData.key);
        return false;
      }
    }
    return false;
  }

  public render() {
    return (
      <div
        className={classnames(
          "property-grid-react-element-list",
          this.props.rootClassName,
        )}
      >
        <div className="property-grid-react-element-list-header">
          <div
            className="property-grid-react-element-list-back-btn"
            onClick={this.props.onBack}
          >
            <Icon
              className="property-grid-react-element-list-icon"
              iconSpec="icon-progress-backward"
            />
          </div>
          <div className="property-grid-react-element-list-title">
            {PropertyGridManager.translate("element-list.title")}
          </div>
        </div>
        <div className="property-grid-react-element-list-container">
          {this.state.dataProvider !== undefined && (
            <Table
              dataProvider={this.state.dataProvider}
              onRowsSelected={this._onRowsSelected}
              selectionMode={SelectionMode.Single}
              hideHeader={true}
            />
          )}
        </div>
        <div className="property-grid-react-element-list-results-label">
          {this.props.instanceKeys.length +
            " " +
            PropertyGridManager.translate("element-list.results")}
        </div>
      </div>
    );
  }
}
