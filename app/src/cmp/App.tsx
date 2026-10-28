import DatasetGeoJoiner from './DatasetGeoJoiner';
import AcsColumnSelector from './AcsColumnSelector';
import { TABLE_IDS } from '../consts';

function App() {
    return (
        <>
            <main>
                <h1>Open Source with SLU</h1>
                <DatasetGeoJoiner />
                <AcsColumnSelector table_ids={TABLE_IDS}/>
            </main>
        </>
    );
}

export default App;
